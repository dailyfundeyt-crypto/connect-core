import { test, expect } from "@playwright/test";

test("sanity check", async ({ page }) => {
  expect(1 + 1).toBe(2);
});
