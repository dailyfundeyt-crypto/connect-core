import { describe, expect, it } from "bun:test";
import {
  databaseComplaint,
  isQueryFailure,
  reasonWithoutStatement,
  withoutStatement,
} from "../src/db/query-failure";

describe("A32 Owned Modules: db/query-failure.ts", () => {
  it("erkennt Query-Failures an eigener Form (query und params)", () => {
    const regularError = new Error("Regular network glitch");
    expect(isQueryFailure(regularError)).toBe(false);

    const queryError = new Error("Failed query: SELECT * FROM credentials");
    (queryError as any).query = "SELECT * FROM credentials";
    (queryError as any).params = ["secret-api-key-value"];
    expect(isQueryFailure(queryError)).toBe(true);
  });

  it("withoutStatement zensiert sensible SQL-Statements und Parameter", () => {
    const regularError = new Error("Regular message");
    expect(withoutStatement(regularError)).toBe("Regular message");

    const queryError = new Error("Failed query: INSERT INTO secrets VALUES ('leaked-secret')");
    (queryError as any).query = "INSERT INTO secrets VALUES ('leaked-secret')";
    (queryError as any).params = ["leaked-secret"];
    queryError.cause = new Error("duplicate key value violates unique constraint");

    const sanitized = withoutStatement(queryError);
    expect(sanitized).not.toContain("INSERT INTO secrets");
    expect(sanitized).not.toContain("leaked-secret");
    expect(sanitized).toBe("duplicate key value violates unique constraint");
  });

  it("reasonWithoutStatement behandelt auch nicht-Error Throws sicher", () => {
    expect(reasonWithoutStatement("A plain string error")).toBe("A plain string error");
    expect(reasonWithoutStatement(404)).toBe("404");

    const standardErr = new Error("Standard exception");
    expect(reasonWithoutStatement(standardErr)).toBe("Standard exception");
  });

  it("databaseComplaint liefert Fallback-Text bei fehlendem cause", () => {
    const queryErrorWithoutCause = new Error("Query failed");
    (queryErrorWithoutCause as any).query = "...";
    (queryErrorWithoutCause as any).params = [];

    const complaint = databaseComplaint(queryErrorWithoutCause);
    expect(complaint).toBe("The database gave no reason this deployment can quote.");
  });
});
