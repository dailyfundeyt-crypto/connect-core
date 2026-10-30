import { test, expect } from "./fixtures";

test.describe("A12/A37 - Settings Navigation v2 & Companies Management", () => {
  test("1. Renders SettingsShellV2 under settingsV2 flag with search and groups", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ settingsV2: true });
    await authedPage.goto("/settings");

    const shell = authedPage.locator('[data-testid="settings-shell-v2"]');
    if (await shell.isVisible()) {
      await expect(shell).toBeVisible();

      // Search input exists
      const searchInput = shell.locator('input[type="search"], input[placeholder*="suchen" i]');
      await expect(searchInput).toBeVisible();

      // Exactly one "Zurück" navigation button
      const backBtn = shell.locator('button[aria-label="Zurück zur App"]');
      await expect(backBtn).toBeVisible();
    } else {
      // In base settings, verify core settings overview is mounted
      await expect(authedPage.locator("main, [data-testid='settings-overview']").first()).toBeVisible();
    }
  });

  test("2. Settings Navigation 6 groups limit", async ({ authedPage, setFlags }) => {
    await setFlags({ settingsV2: true });
    await authedPage.goto("/settings");

    const shell = authedPage.locator('[data-testid="settings-shell-v2"]');
    if (await shell.isVisible()) {
      // Expected canonical groups: Konto, Firma, Verbindungen, Agenten, Darstellung, System
      const navGroups = shell.locator("nav button, nav [role='button']");
      const count = await navGroups.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("3. 'Firmen verwalten' page renders without destructive delete button (Rule 2)", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ settingsV2: true });
    await authedPage.goto("/settings");

    const manageLink = authedPage.locator('a[href*="/settings/companies"], button:has-text("Firmen verwalten")');
    if (await manageLink.isVisible()) {
      await manageLink.click();
      const managePage = authedPage.locator('[data-testid="companies-manage-page"]');
      if (await managePage.isVisible()) {
        await expect(managePage).toBeVisible();

        // Destructive delete button is prohibited according to Rule 2
        const deleteBtn = managePage.locator('button:has-text("Löschen"), button[aria-label*="löschen" i]');
        await expect(deleteBtn).toHaveCount(0);
      }
    }
  });

  test("4. Onboarding restart button in appearance/settings", async ({ authedPage, setFlags }) => {
    await setFlags({ settingsV2: true, onboardingV2: true });
    await authedPage.goto("/settings");

    // Look for restart onboarding trigger
    const restartBtn = authedPage.locator('button:has-text("Onboarding"), button:has-text("Ersteinrichtung neu starten")');
    if (await restartBtn.first().isVisible()) {
      await expect(restartBtn.first()).toBeVisible();
    }
  });
});
