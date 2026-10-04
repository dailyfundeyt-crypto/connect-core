/**
 * The CopilotKit runner for local mode: the runtime's own in-memory runner, made durable.
 *
 * Runs and live joins are the stock `InMemoryAgentRunner` (same streaming, same stop, same replay
 * for a tab that joins mid-run). What it adds:
 *   - after every run (finished, failed or stopped) the agent's full message list is written to
 *     Postgres through {@link ChatStore.saveRun}, from a subscription of its own, so a browser that
 *     closes mid-answer does not lose the answer;
 *   - a thread this process has not seen since it started (after an App restart) is loaded back from
 *     Postgres before it is joined or run, so its history replays and the next run continues it.
 */
import { type BaseEvent, EventType } from "@ag-ui/client";
import { InMemoryAgentRunner, ɵGLOBAL_STORE } from "@copilotkit/runtime/v2";
import { Observable, type Subscription } from "rxjs";
import { type ChatStore, onChatStoreRestored } from "./store";

type RunRequest = Parameters<InMemoryAgentRunner["run"]>[0];
type ConnectRequest = Parameters<InMemoryAgentRunner["connect"]>[0];
type RunEvent = BaseEvent;

type GlobalStore = {
  map?: Map<string, { isRunning?: boolean; stopRequested?: boolean }>;
  removeThread?: (threadId: string, store: unknown) => void;
  peek: (threadId: string) => unknown;
  getOrCreate: (threadId: string) => unknown;
  appendRun: (threadId: string, run: Record<string, unknown>) => void;
};

export class PostgresAgentRunner extends InMemoryAgentRunner {
  private readonly loading = new Map<string, Promise<void>>();

  constructor(
    private readonly store: ChatStore,
    private readonly onBusy?: (input: { threadId: string; busy: boolean }) => void,
  ) {
    super();
    // After a backup restore the database is the truth again: forget every idle thread held in
    // memory, so the next join or run reloads it from Postgres.
    onChatStoreRestored(() => this.forgetIdleThreads());
  }

  forgetIdleThreads(): number {
    const memory = this.memory;
    let forgotten = 0;
    for (const [threadId, held] of [...(memory.map ?? new Map())]) {
      if (held.isRunning || held.stopRequested) continue;
      memory.removeThread?.(threadId, held);
      forgotten += 1;
    }
    return forgotten;
  }

  private get memory(): GlobalStore {
    return ɵGLOBAL_STORE as unknown as GlobalStore;
  }

  /** Put a stored thread back into the in-memory store, once, if it is not there already. */
  private restore(threadId: string, agentId: string | undefined): Promise<void> {
    if (this.memory.peek(threadId)) return Promise.resolve();
    let pending = this.loading.get(threadId);
    if (!pending) {
      pending = (async () => {
        const messages = await this.store.messages(threadId);
        if (messages.length === 0 || this.memory.peek(threadId)) return;
        const state = await this.store.state(threadId);
        const runId = `restored-${threadId}`;
        const events = [
          {
            type: EventType.RUN_STARTED,
            threadId,
            runId,
            input: { threadId, runId, messages, state: state ?? {}, tools: [], context: [], forwardedProps: {} },
          },
          { type: EventType.MESSAGES_SNAPSHOT, messages },
          ...(state ? [{ type: EventType.STATE_SNAPSHOT, snapshot: state }] : []),
          { type: EventType.RUN_FINISHED, threadId, runId },
        ];
        this.memory.getOrCreate(threadId);
        this.memory.appendRun(threadId, {
          threadId,
          runId,
          agentId: agentId ?? "default",
          parentRunId: null,
          events,
          messages,
          createdAt: Date.now(),
        });
      })()
        .catch((error) => {
          console.error(JSON.stringify({ type: "chat-store-restore-failed", threadId, error: String(error) }));
        })
        .finally(() => this.loading.delete(threadId));
      this.loading.set(threadId, pending);
    }
    return pending;
  }

  private persist(request: RunRequest): void {
    const agent = request.agent as { agentId?: string; messages?: unknown[]; state?: unknown };
    void this.store
      .saveRun({
        threadId: request.threadId,
        agentId: agent.agentId ?? "default",
        messages: Array.isArray(agent.messages) ? agent.messages : [],
        state: agent.state,
      })
      .catch((error) => {
        console.error(JSON.stringify({ type: "chat-store-save-failed", threadId: request.threadId, error: String(error) }));
      });
  }

  override run(request: RunRequest): ReturnType<InMemoryAgentRunner["run"]> {
    return new Observable<RunEvent>((subscriber) => {
      let forward: Subscription | undefined;
      let closed = false;
      void this.restore(request.threadId, (request.agent as { agentId?: string }).agentId).then(() => {
        if (closed) return;
        let source: ReturnType<InMemoryAgentRunner["run"]>;
        try {
          source = super.run(request);
        } catch (error) {
          subscriber.error(error);
          return;
        }
        try {
          this.onBusy?.({ threadId: request.threadId, busy: true });
        } catch {}
        // Its own subscription, so the save happens even when the browser that started the run is gone.
        source.subscribe({
          complete: () => {
            this.persist(request);
            try {
              this.onBusy?.({ threadId: request.threadId, busy: false });
            } catch {}
          },
          error: () => {
            this.persist(request);
            try {
              this.onBusy?.({ threadId: request.threadId, busy: false });
            } catch {}
          },
        });
        forward = source.subscribe(subscriber);
      });
      return () => {
        closed = true;
        forward?.unsubscribe();
      };
    }) as ReturnType<InMemoryAgentRunner["run"]>;
  }

  override connect(request: ConnectRequest): ReturnType<InMemoryAgentRunner["connect"]> {
    return new Observable<RunEvent>((subscriber) => {
      let forward: Subscription | undefined;
      let closed = false;
      void this.restore(request.threadId, (request as { agentId?: string }).agentId).then(() => {
        if (closed) return;
        forward = super.connect(request).subscribe(subscriber);
      });
      return () => {
        closed = true;
        forward?.unsubscribe();
      };
    }) as ReturnType<InMemoryAgentRunner["connect"]>;
  }
}
