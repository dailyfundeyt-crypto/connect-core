import { describe, it, expect, beforeEach } from "bun:test";
import { SwarmRoleManager } from "./roles";

describe("SwarmRoleManager", () => {
  let roles: SwarmRoleManager;

  beforeEach(() => {
    roles = new SwarmRoleManager();
  });

  it("defaults unknown bots to worker role", () => {
    expect(roles.getRoles("random-bot-99")).toEqual(["worker"]);
    expect(roles.hasRole("random-bot-99", "worker")).toBe(true);
    expect(roles.hasRole("random-bot-99", "reviewer")).toBe(false);
  });

  it("assigns and retrieves multiple roles", () => {
    roles.assignRoles("special-bot", ["planner", "reviewer"]);
    expect(roles.hasRole("special-bot", "planner")).toBe(true);
    expect(roles.hasRole("special-bot", "reviewer")).toBe(true);
    expect(roles.hasRole("special-bot", "worker")).toBe(false);
  });

  it("finds all bots assigned to a role", () => {
    roles.assignRoles("p1", ["planner"]);
    roles.assignRoles("p2", ["planner", "worker"]);
    roles.assignRoles("w1", ["worker"]);

    const planners = roles.findBotsForRole("planner");
    expect(planners).toContain("p1");
    expect(planners).toContain("p2");
    expect(planners).not.toContain("w1");
  });
});
