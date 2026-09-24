import { describe, expect, test } from "bun:test";
import { resolveLabEngine } from "@/lib/companies/level3-tools";

describe("resolveLabEngine", () => {
  test("defaults to full — Connect is the browser", () => {
    expect(resolveLabEngine(undefined)).toBe("full");
    expect(resolveLabEngine("full")).toBe("full");
  });

  test("only explicit embed keeps the iframe preview", () => {
    expect(resolveLabEngine("embed")).toBe("embed");
  });
});
