/**
 * Clock abstraction for deterministic time-based simulation and production timers.
 */

export interface ClockTimer {
  id: unknown;
  unref?: () => void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): ClockTimer;
  clearTimeout(timer: ClockTimer | unknown): void;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): ClockTimer {
    const id = setTimeout(fn, ms);
    return {
      id,
      unref: () => {
        if (typeof (id as any)?.unref === "function") {
          (id as any).unref();
        }
      },
    };
  }

  clearTimeout(timer: ClockTimer | unknown): void {
    const rawId = timer && typeof timer === "object" && "id" in (timer as any)
      ? (timer as any).id
      : timer;
    clearTimeout(rawId as any);
  }
}

interface ScheduledFakeTimer {
  id: number;
  due: number;
  fn: () => void;
}

export class FakeClock implements Clock {
  private currentTime: number;
  private timers: ScheduledFakeTimer[] = [];
  private nextId = 1;

  constructor(initialTime = 1_700_000_000_000) {
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  setTimeout(fn: () => void, ms: number): ClockTimer {
    const id = this.nextId++;
    this.timers.push({
      id,
      due: this.currentTime + Math.max(0, ms),
      fn,
    });
    this.timers.sort((a, b) => a.due - b.due || a.id - b.id);
    return { id, unref: () => {} };
  }

  clearTimeout(timer: ClockTimer | unknown): void {
    const id = timer && typeof timer === "object" && "id" in (timer as any)
      ? (timer as any).id
      : timer;
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  advance(ms: number): void {
    if (ms < 0) {
      throw new Error("Cannot advance time backwards");
    }
    const target = this.currentTime + ms;
    while (this.timers.length > 0 && this.timers[0].due <= target) {
      const next = this.timers.shift()!;
      this.currentTime = next.due;
      next.fn();
    }
    this.currentTime = target;
  }

  set(targetTime: number): void {
    if (targetTime < this.currentTime) {
      throw new Error("Time cannot move backwards");
    }
    this.advance(targetTime - this.currentTime);
  }

  getPendingTimersCount(): number {
    return this.timers.length;
  }
}
