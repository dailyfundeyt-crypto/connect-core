/**
 * The Notch voice bridge, in memory.
 *
 * Connect Notch (a native Windows app) cannot run a Connect turn itself: turns run in the browser
 * (CopilotKit + frontend tools), so the Notch hands its spoken text and screenshots to whichever
 * Connect window of the same person is open, and that window sends them through its normal
 * composer, in the agent's own chat. This hub is the meeting point: UI clients subscribe, the
 * Notch creates turns, the UI reports reply text back, the Notch reads it (poll or SSE).
 *
 * Process memory only, by design: a turn is a few minutes of a live call, not a record. The chat
 * itself is the durable record. One server process serves one machine here (single-user app).
 */

export type BridgeAttachment = {
  id: string;
  mimeType?: string;
  filename?: string;
};

export type TurnStatus = "queued" | "delivered" | "done" | "error";

export type BridgeTurn = {
  id: string;
  actorId: string;
  agentId: string;
  channelId: string;
  text: string;
  attachments: BridgeAttachment[];
  status: TurnStatus;
  /** The agent's reply as far as it has arrived (whole text so far, not a delta). */
  reply: string;
  error: string | null;
  clientId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TurnEvent =
  | { type: "progress"; turn: PublicTurn }
  | { type: "done"; turn: PublicTurn }
  | { type: "error"; turn: PublicTurn };

export type PublicTurn = Omit<BridgeTurn, "actorId">;

export type UiClient = {
  id: string;
  actorId: string;
  /** Pushes one event to that browser tab. Returns false when the tab is gone. */
  send: (event: string, data: unknown) => boolean;
  connectedAt: number;
  claimedAt: number;
};

/** A queued turn waits this long for a Connect window to open before it fails. */
export const QUEUE_TIMEOUT_MS = 45_000;
/** Finished turns are forgotten after this. */
export const TURN_TTL_MS = 30 * 60_000;
/** A delivered turn with no word from the UI for this long is failed (tab closed mid-turn). */
export const SILENT_TURN_TIMEOUT_MS = 15 * 60_000;

export function publicTurn(turn: BridgeTurn): PublicTurn {
  const { actorId: _actorId, ...rest } = turn;
  return rest;
}

export function createVoiceBridgeHub(options: { now?: () => number; newId?: () => string } = {}) {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => crypto.randomUUID());
  const clients = new Map<string, UiClient>();
  const turns = new Map<string, BridgeTurn>();
  const listeners = new Map<string, Set<(event: TurnEvent) => void>>();

  function emit(turn: BridgeTurn, type: TurnEvent["type"]) {
    const set = listeners.get(turn.id);
    if (!set) return;
    const event = { type, turn: publicTurn(turn) } as TurnEvent;
    for (const fn of [...set]) {
      try {
        fn(event);
      } catch {
        /* a broken listener must not break the others */
      }
    }
  }

  /** The tab that should take a turn: the most recently claimed (focused) one of that person. */
  function pickClient(actorId: string): UiClient | null {
    let best: UiClient | null = null;
    for (const client of clients.values()) {
      if (client.actorId !== actorId) continue;
      if (!best || client.claimedAt > best.claimedAt) best = client;
    }
    return best;
  }

  function deliver(turn: BridgeTurn): boolean {
    // Try every tab of this person, newest claim first, until one takes it.
    const candidates = [...clients.values()]
      .filter((client) => client.actorId === turn.actorId)
      .sort((a, b) => b.claimedAt - a.claimedAt);
    for (const client of candidates) {
      const ok = client.send("turn", {
        turnId: turn.id,
        agentId: turn.agentId,
        channelId: turn.channelId,
        text: turn.text,
        attachments: turn.attachments,
      });
      if (ok) {
        turn.status = "delivered";
        turn.clientId = client.id;
        turn.updatedAt = now();
        emit(turn, "progress");
        return true;
      }
      clients.delete(client.id);
    }
    return false;
  }

  function fail(turn: BridgeTurn, message: string) {
    turn.status = "error";
    turn.error = message;
    turn.updatedAt = now();
    emit(turn, "error");
  }

  return {
    addClient(input: { actorId: string; send: UiClient["send"]; id?: string }): UiClient {
      const at = now();
      const client: UiClient = {
        id: input.id ?? newId(),
        actorId: input.actorId,
        send: input.send,
        connectedAt: at,
        claimedAt: at,
      };
      clients.set(client.id, client);
      // A window that just opened is where queued turns of this person go.
      for (const turn of turns.values()) {
        if (turn.actorId === client.actorId && turn.status === "queued") deliver(turn);
      }
      return client;
    },

    removeClient(clientId: string) {
      clients.delete(clientId);
    },

    /** The tab was focused: it becomes the one that takes the next turn. */
    claim(actorId: string, clientId: string): boolean {
      const client = clients.get(clientId);
      if (!client || client.actorId !== actorId) return false;
      client.claimedAt = now();
      return true;
    },

    clientCount(actorId: string): number {
      let n = 0;
      for (const client of clients.values()) if (client.actorId === actorId) n += 1;
      return n;
    },

    hasClient(actorId: string): boolean {
      return pickClient(actorId) !== null;
    },

    createTurn(input: {
      actorId: string;
      agentId: string;
      channelId: string;
      text: string;
      attachments?: BridgeAttachment[];
    }): BridgeTurn {
      const at = now();
      const turn: BridgeTurn = {
        id: newId(),
        actorId: input.actorId,
        agentId: input.agentId,
        channelId: input.channelId,
        text: input.text,
        attachments: input.attachments ?? [],
        status: "queued",
        reply: "",
        error: null,
        clientId: null,
        createdAt: at,
        updatedAt: at,
      };
      turns.set(turn.id, turn);
      deliver(turn);
      return turn;
    },

    get(actorId: string, turnId: string): BridgeTurn | null {
      const turn = turns.get(turnId);
      return turn && turn.actorId === actorId ? turn : null;
    },

    /** What the UI reports: the reply so far, and whether the turn has finished. */
    progress(
      actorId: string,
      turnId: string,
      update: { text?: string; done?: boolean; error?: string | null },
    ): BridgeTurn | null {
      const turn = turns.get(turnId);
      if (!turn || turn.actorId !== actorId) return null;
      if (turn.status === "done" || turn.status === "error") return turn;
      if (typeof update.text === "string") turn.reply = update.text;
      turn.updatedAt = now();
      if (update.error) {
        fail(turn, update.error);
      } else if (update.done) {
        turn.status = "done";
        emit(turn, "done");
      } else {
        emit(turn, "progress");
      }
      return turn;
    },

    subscribe(turnId: string, fn: (event: TurnEvent) => void): () => void {
      let set = listeners.get(turnId);
      if (!set) {
        set = new Set();
        listeners.set(turnId, set);
      }
      set.add(fn);
      return () => {
        set?.delete(fn);
        if (set && set.size === 0) listeners.delete(turnId);
      };
    },

    /** Times out turns nobody took or nobody finished, and forgets old ones. Called on a timer. */
    sweep() {
      const at = now();
      for (const turn of [...turns.values()]) {
        if (turn.status === "queued" && at - turn.createdAt > QUEUE_TIMEOUT_MS) {
          fail(turn, "Kein Connect-Fenster offen. Bitte Connect öffnen und erneut versuchen.");
        } else if (turn.status === "delivered" && at - turn.updatedAt > SILENT_TURN_TIMEOUT_MS) {
          fail(turn, "Connect hat sich nicht mehr gemeldet (Fenster geschlossen?).");
        } else if ((turn.status === "done" || turn.status === "error") && at - turn.updatedAt > TURN_TTL_MS) {
          turns.delete(turn.id);
          listeners.delete(turn.id);
        }
      }
      // Heartbeat doubles as liveness check for tabs whose stream silently died.
      for (const client of [...clients.values()]) {
        if (!client.send("ping", { at })) clients.delete(client.id);
      }
    },
  };
}

export type VoiceBridgeHub = ReturnType<typeof createVoiceBridgeHub>;
