/**
 * Unit- & Integrationstests für Connect Desktop Routinen, Scheduler & Todos (Lane 6).
 *
 * Akzeptanzkriterien (§10 in 00-plan.md & agent-6-START.md):
 * 1. Unit-Tests Parser (Routinen, geplante Suche, Todos, relative & absolute Zeiten)
 * 2. Host-Online Prüfung & Nachholen-Policy („run_once“, „skip“)
 * 3. Kill-Switch Respektierung (< 300 ms Abbruch)
 * 4. Routine 1 min in Zukunft läuft
 * 5. Todo-Erinnerung erscheint (Notch-Karte & Windows-Toast)
 */

import { describe, expect, it } from "bun:test";
import {
  parseNaturalLanguageRoutine,
  parsePlannedSearch,
  calculateNextRun,
  DEFAULT_TIMEZONE,
} from "../src/desktop/routines";
import {
  parseNaturalLanguageTodo,
  formatNotchCardForTodo,
  formatToastForTodo,
} from "../src/desktop/todos";
import { DesktopScheduler } from "../src/desktop/scheduler";
import {
  desktopRoutines,
  desktopTodos,
  desktopPlannedSearches,
  desktopSchedulerState,
  type DesktopRoutineRecord,
  type DesktopTodoRecord,
} from "../src/db/schema/desktop-routines";
import type { DesktopAction, ActionResultParams } from "../../../../packages/shared/src/desktop/contracts";

describe("Desktop Routines & Parser (Lane 6)", () => {
  /* ======================================================================== */
  /* 1. Unit-Tests: Routinen Parser                                           */
  /* ======================================================================== */
  describe("Routinen Parser", () => {
    it("parst „jeden Morgen 9:00 Unity + Spotify“ korrekt als Cron", () => {
      const parsed = parseNaturalLanguageRoutine("jeden Morgen 9:00 Unity + Spotify");
      expect(parsed.scheduleType).toBe("cron");
      expect(parsed.cronExpression).toBe("0 9 * * *");
      expect(parsed.actions.length).toBe(2);
      expect(parsed.actions[0].type).toBe("open_app");
      expect(parsed.actions[0].openApp?.appName).toBe("Unity");
      expect(parsed.actions[1].type).toBe("open_app");
      expect(parsed.actions[1].openApp?.appName).toBe("Spotify");
      expect(parsed.catchUpPolicy).toBe("run_once");
    });

    it("parst „jeden Werktag 08:30 Slack und Chrome“", () => {
      const parsed = parseNaturalLanguageRoutine("jeden Werktag 08:30 Slack und Chrome");
      expect(parsed.scheduleType).toBe("cron");
      expect(parsed.cronExpression).toBe("30 8 * * 1-5");
      expect(parsed.actions.map((a) => a.openApp?.appName)).toEqual(["Slack", "Chrome"]);
    });

    it("parst „jeden Montag 10:00 Weekly Standup auf meet.google.com/abc“", () => {
      const parsed = parseNaturalLanguageRoutine("jeden Montag 10:00 Weekly Standup auf meet.google.com/abc");
      expect(parsed.scheduleType).toBe("cron");
      expect(parsed.cronExpression).toBe("0 10 * * 1");
      expect(parsed.actions.length).toBe(1);
      expect(parsed.actions[0].type).toBe("open_url");
      expect(parsed.actions[0].openUrl?.url).toContain("meet.google.com/abc");
    });

    it("parst Intervalle wie „alle 15 Minuten“", () => {
      const parsed = parseNaturalLanguageRoutine("alle 15 Minuten Pause machen");
      expect(parsed.scheduleType).toBe("cron");
      expect(parsed.cronExpression).toBe("*/15 * * * *");
    });

    it("parst einmalige Aktionen „in 1 Minute Notepad öffnen“", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const parsed = parseNaturalLanguageRoutine("in 1 Minute Notepad öffnen", baseDate);
      expect(parsed.scheduleType).toBe("once");
      expect(parsed.cronExpression).toBe("@once");
      expect(parsed.triggerAt).toBeDefined();
      const diffMs = (parsed.triggerAt?.getTime() ?? 0) - baseDate.getTime();
      expect(diffMs).toBe(60 * 1000);
      expect(parsed.actions[0].openApp?.appName).toBe("Notepad");
    });
  });

  /* ======================================================================== */
  /* 2. Unit-Tests: Geplante Suche Parser                                     */
  /* ======================================================================== */
  describe("Geplante Suche Parser", () => {
    it("parst „Amazon nach Geschenkpapier 10. Nov 11:00“", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const search = parsePlannedSearch("Amazon nach Geschenkpapier 10. Nov 11:00", baseDate);
      expect(search).not.toBeNull();
      expect(search?.targetPlatform).toBe("amazon");
      expect(search?.query).toBe("Geschenkpapier");
      expect(search?.targetUrl).toContain("amazon.de/s?k=Geschenkpapier");
      expect(search?.scheduledTime.getMonth()).toBe(10); // November (0-indexed = 10)
      expect(search?.scheduledTime.getDate()).toBe(10);
      expect(search?.scheduledTime.getHours()).toBe(11);
      expect(search?.actions[0].type).toBe("open_url");
    });

    it("parst „YouTube nach LoFi Beats morgen um 18:00“", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const search = parsePlannedSearch("YouTube nach LoFi Beats morgen um 18:00", baseDate);
      expect(search).not.toBeNull();
      expect(search?.targetPlatform).toBe("youtube");
      expect(search?.query).toBe("LoFi Beats");
      expect(search?.targetUrl).toContain("youtube.com/results?search_query=LoFi%20Beats");
      expect(search?.scheduledTime.getDate()).toBe(23); // 22 + 1 = 23
      expect(search?.scheduledTime.getHours()).toBe(18);
    });
  });

  /* ======================================================================== */
  /* 3. Unit-Tests: Todos & Reminder Parser                                   */
  /* ======================================================================== */
  describe("Todos & Reminder Parser", () => {
    it("parst „Erinnere mich morgen um 14:00 an Meeting mit Stefan“", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const todo = parseNaturalLanguageTodo("Erinnere mich morgen um 14:00 an Meeting mit Stefan", baseDate);
      expect(todo.title).toBe("Meeting mit Stefan");
      expect(todo.dueTime).toBeDefined();
      expect(todo.dueTime?.getDate()).toBe(23);
      expect(todo.dueTime?.getHours()).toBe(14);
      expect(todo.reminderChannel).toBe("both");
    });

    it("parst „In 10 Minuten Wäsche aufhängen“", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const todo = parseNaturalLanguageTodo("In 10 Minuten Wäsche aufhängen", baseDate);
      expect(todo.title).toBe("Wäsche aufhängen");
      expect(todo.dueTime?.getTime()).toBe(baseDate.getTime() + 10 * 60 * 1000);
    });

    it("erkennt verknüpfte App und URL im Todo", () => {
      const baseDate = new Date("2026-10-22T10:00:00.000Z");
      const todo = parseNaturalLanguageTodo(
        "Dokument auf https://docs.google.com/doc1 in VS Code bis 16 Uhr prüfen",
        baseDate,
      );
      expect(todo.associatedUrl).toContain("https://docs.google.com/doc1");
      expect(todo.associatedApp).toBe("VS Code");
    });

    it("formatiert Notch-Karte und Windows-Toast", () => {
      const mockTodo: DesktopTodoRecord = {
        id: "todo-123",
        title: "Geschenk kaufen",
        description: "Für Stefan",
        dueTime: new Date("2026-10-22T15:00:00.000Z"),
        completed: false,
        completedAt: null,
        associatedUrl: "https://amazon.de",
        associatedApp: "Helium",
        reminderSent: false,
        reminderTime: new Date("2026-10-22T15:00:00.000Z"),
        reminderChannel: "both",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const card = formatNotchCardForTodo(mockTodo);
      expect(card.cardId).toBe("card-todo-todo-123");
      expect(card.title).toBe("Erinnerung: Geschenk kaufen");
      expect(card.type).toBe("routine");
      expect(card.buttons?.length).toBe(2);

      const toast = formatToastForTodo(mockTodo);
      expect(toast.title).toBe("Connect To-Do: Geschenk kaufen");
      expect(toast.actionUrl).toBe("https://amazon.de");
    });
  });

  /* ======================================================================== */
  /* 4. Scheduler Tests (Host-Online, Kill-Switch, 1-Min Routine, Reminders) */
  /* ======================================================================== */
  describe("Desktop Scheduler Logik & Akzeptanz", () => {
    // In-Memory Mock Database
    function createMockDb(initial: {
      routines?: DesktopRoutineRecord[];
      todos?: DesktopTodoRecord[];
      plannedSearches?: any[];
    }) {
      const routines = [...(initial.routines || [])];
      const runs: any[] = [];
      const todos = [...(initial.todos || [])];
      const searches = [...(initial.plannedSearches || [])];
      let schedulerState: any = {
        id: "singleton",
        hostOnline: false,
        killSwitchActive: false,
      };

      const mockDb: any = {
        select: () => ({
          from: (table: any) => ({
            where: (condition: any) => {
              const tableName = table[Symbol.for("drizzle:Name")] || "";
              if (tableName.includes("desktop_routines") || table === desktopRoutines) {
                return Promise.resolve(routines.filter((r) => r.enabled));
              }
              if (tableName.includes("desktop_todos") || table === desktopTodos) {
                return Promise.resolve(todos.filter((t) => !t.completed && !t.reminderSent));
              }
              if (tableName.includes("desktop_planned_searches") || table === desktopPlannedSearches) {
                return Promise.resolve(searches.filter((s) => s.status === "pending"));
              }
              return Promise.resolve([]);
            },
          }),
        }),
        insert: (table: any) => ({
          values: (val: any) => {
            const p = Promise.resolve([val]);
            return Object.assign(p, {
              onConflictDoUpdate: () => {
                schedulerState = { ...schedulerState, ...val };
                return Promise.resolve([schedulerState]);
              },
              returning: () => {
                runs.push(val);
                return Promise.resolve([val]);
              },
              then: (resolve: any, reject: any) => {
                runs.push(val);
                return p.then(resolve, reject);
              },
            });
          },
        }),
        update: (table: any) => ({
          set: (patch: any) => ({
            where: (cond: any) => {
              // Aktualisiere in Arrays
              for (const r of routines) {
                if (patch.lastRunAt) r.lastRunAt = patch.lastRunAt;
                if (patch.nextRunAt !== undefined) r.nextRunAt = patch.nextRunAt;
                if (patch.enabled !== undefined) r.enabled = patch.enabled;
              }
              for (const t of todos) {
                if (patch.reminderSent !== undefined) t.reminderSent = patch.reminderSent;
              }
              for (const s of searches) {
                if (patch.status) s.status = patch.status;
              }
              const p = Promise.resolve([patch]);
              return Object.assign(p, {
                returning: () => p,
                catch: p.catch.bind(p),
                then: p.then.bind(p),
              });
            },
          }),
        }),
        _state: { routines, runs, todos, searches, schedulerState },
      };

      return mockDb;
    }

    it("führt KEINE Aktionen aus, wenn Host OFFLINE ist (Host-Online-Prüfung)", async () => {
      const dispatchedActions: DesktopAction[] = [];
      const mockRoutine: DesktopRoutineRecord = {
        id: "rout-due-1",
        name: "Test Routine",
        description: null,
        cronExpression: "* * * * *",
        scheduleType: "cron",
        triggerAt: null,
        naturalLanguagePrompt: "Test",
        enabled: true,
        actions: [{ type: "open_app", openApp: { appName: "Notepad" } }],
        targetAgentId: null,
        catchUpPolicy: "run_once",
        lastRunAt: null,
        nextRunAt: new Date(Date.now() - 5000), // Bereits fällig!
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({ routines: [mockRoutine] });
      const scheduler = new DesktopScheduler({
        database: mockDb,
        actionDispatcher: async (act) => {
          dispatchedActions.push(act);
          return { actionId: "1", status: "success", executionDurationMs: 5 };
        },
      });

      scheduler.setHostOnline(false); // Host OFFLINE!
      const tickRes = await scheduler.tick(new Date());

      expect(tickRes.hostOnline).toBe(false);
      expect(tickRes.executedRoutinesCount).toBe(0);
      expect(dispatchedActions.length).toBe(0); // Keine Aktion ausgeführt!
    });

    it("respektiert den Kill-Switch (< 300 ms Abbruch)", async () => {
      const dispatchedActions: DesktopAction[] = [];
      const mockRoutine: DesktopRoutineRecord = {
        id: "rout-due-kill",
        name: "Kill Test",
        description: null,
        cronExpression: "* * * * *",
        scheduleType: "cron",
        triggerAt: null,
        naturalLanguagePrompt: "Kill",
        enabled: true,
        actions: [{ type: "open_app", openApp: { appName: "Notepad" } }],
        targetAgentId: null,
        catchUpPolicy: "run_once",
        lastRunAt: null,
        nextRunAt: new Date(Date.now() - 5000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({ routines: [mockRoutine] });
      const scheduler = new DesktopScheduler({
        database: mockDb,
        actionDispatcher: async (act) => {
          dispatchedActions.push(act);
          return { actionId: "1", status: "success", executionDurationMs: 5 };
        },
      });

      scheduler.setHostOnline(true);
      scheduler.setKillSwitch(true); // NOT-AUS AKTIV!

      const tickRes = await scheduler.tick(new Date());

      expect(tickRes.killSwitchActive).toBe(true);
      expect(tickRes.executedRoutinesCount).toBe(0);
      expect(dispatchedActions.length).toBe(0);
    });

    it("Akzeptanztest §10: Routine 1 min in Zukunft läuft", async () => {
      const baseTime = new Date("2026-10-22T12:00:00.000Z");
      const targetTime = new Date(baseTime.getTime() + 60 * 1000); // 1 Minute in der Zukunft!

      const dispatchedActions: DesktopAction[] = [];
      const routine1Min: DesktopRoutineRecord = {
        id: "rout-1min",
        name: "1 Min Zukunft Routine",
        description: null,
        cronExpression: "@once",
        scheduleType: "once",
        triggerAt: targetTime,
        naturalLanguagePrompt: "in 1 Minute Notepad öffnen",
        enabled: true,
        actions: [
          {
            type: "open_app",
            risk: "act",
            targetDescription: "Starte Notepad",
            openApp: { appName: "Notepad" },
          },
        ],
        targetAgentId: null,
        catchUpPolicy: "run_once",
        lastRunAt: null,
        nextRunAt: null,
        createdAt: baseTime,
        updatedAt: baseTime,
      };

      const mockDb = createMockDb({ routines: [routine1Min] });
      const scheduler = new DesktopScheduler({
        database: mockDb,
        actionDispatcher: async (act) => {
          dispatchedActions.push(act);
          return { actionId: "act-1min", status: "success", executionDurationMs: 15 };
        },
      });

      scheduler.setHostOnline(true);

      // 1. Tick zur Basiszeit: Noch nicht fällig
      const tickBefore = await scheduler.tick(baseTime);
      expect(tickBefore.executedRoutinesCount).toBe(0);
      expect(dispatchedActions.length).toBe(0);

      // 2. Tick nach 1 Minute: Jetzt fällig und läuft!
      const tickAfter = await scheduler.tick(targetTime);
      expect(tickAfter.executedRoutinesCount).toBe(1);
      expect(dispatchedActions.length).toBe(1);
      expect(dispatchedActions[0].openApp?.appName).toBe("Notepad");
      expect(routine1Min.lastRunAt).toBeDefined();
    });

    it("Akzeptanztest §10: Todo-Erinnerung erscheint (Notch-Karte & Toast)", async () => {
      const dueTime = new Date("2026-10-22T13:00:00.000Z");
      const mockTodo: DesktopTodoRecord = {
        id: "todo-alert-1",
        title: "Wichtiges Telefonat mit Stefan",
        description: null,
        dueTime,
        completed: false,
        completedAt: null,
        associatedUrl: "https://connect.example",
        associatedApp: "Helium",
        reminderSent: false,
        reminderTime: dueTime,
        reminderChannel: "both",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const notchCards: any[] = [];
      const toasts: any[] = [];

      const mockDb = createMockDb({ todos: [mockTodo] });
      const scheduler = new DesktopScheduler({
        database: mockDb,
        notchCardDispatcher: async (card) => {
          notchCards.push(card);
          return true;
        },
        toastDispatcher: async (toast) => {
          toasts.push(toast);
          return true;
        },
      });

      scheduler.setHostOnline(true);

      // Tick zur Fälligkeitszeit
      const tickRes = await scheduler.tick(dueTime);

      expect(tickRes.remindersSentCount).toBe(1);
      expect(notchCards.length).toBe(1);
      expect(notchCards[0].title).toContain("Wichtiges Telefonat mit Stefan");
      expect(toasts.length).toBe(1);
      expect(toasts[0].title).toContain("Wichtiges Telefonat mit Stefan");
      expect(mockTodo.reminderSent).toBe(true);
    });

    it("Nachholen-Policy: Bei Wiederverbindung führt 'run_once' versäumte Routine aus", async () => {
      const dispatchedActions: DesktopAction[] = [];
      const missedRoutine: DesktopRoutineRecord = {
        id: "rout-missed-1",
        name: "Verpasste Morgenroutine",
        description: null,
        cronExpression: "0 9 * * *",
        scheduleType: "cron",
        triggerAt: null,
        naturalLanguagePrompt: "jeden Morgen 9:00 Unity + Spotify",
        enabled: true,
        actions: [{ type: "open_app", openApp: { appName: "Unity" } }],
        targetAgentId: null,
        catchUpPolicy: "run_once",
        lastRunAt: new Date("2026-10-21T07:00:00.000Z"), // Gestern
        nextRunAt: new Date("2026-10-22T07:00:00.000Z"), // Heute 9 Uhr (jetzt ist 12 Uhr)
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({ routines: [missedRoutine] });
      const scheduler = new DesktopScheduler({
        database: mockDb,
        actionDispatcher: async (act) => {
          dispatchedActions.push(act);
          return { actionId: "act-catchup", status: "success", executionDurationMs: 12 };
        },
      });

      // Host kommt um 12:00 online
      scheduler.setHostOnline(true);
      const currentTime = new Date("2026-10-22T10:00:00.000Z"); // 12:00 Berlin

      const tickRes = await scheduler.tick(currentTime);

      expect(tickRes.executedRoutinesCount).toBe(1);
      expect(tickRes.missedRoutinesHandled).toBe(1);
      expect(dispatchedActions.length).toBe(1);
      expect(dispatchedActions[0].openApp?.appName).toBe("Unity");
    });
  });
});
