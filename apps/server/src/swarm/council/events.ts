import { EventEmitter } from "node:events";
import type { CouncilEventPayload } from "./types";

class CouncilEventEmitter extends EventEmitter {
  public emitEvent(payload: CouncilEventPayload): void {
    this.emit(`session:${payload.sessionId}`, payload);
    this.emit("all", payload);
  }

  public subscribeToSession(
    sessionId: string,
    listener: (event: CouncilEventPayload) => void
  ): () => void {
    const eventName = `session:${sessionId}`;
    this.on(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }
}

export const councilEvents = new CouncilEventEmitter();
