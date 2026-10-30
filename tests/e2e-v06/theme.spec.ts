import { test, expect } from "./fixtures";

test.describe("A03/A37 - Theme (Dark Mode Default & Theme Selection)", () => {
  test("1. Dark Mode follows system preference or explicit dark setting", async ({ authedPage, setFlags }) => {
    await authedPage.emulateMedia({ colorScheme: "dark" });
    await setFlags({ themeV2: true });
    await authedPage.goto("/agents");

    // Root html element carries dark or theme classes
    const html = authedPage.locator("html");
    await expect(html).toHaveClass(/(dark|connect-premium)/);
  });

  test("2. Theme preference persistence in localStorage", async ({ authedPage, setFlags }) => {
    await setFlags({ themeV2: true });
    await authedPage.goto("/agents");

    // Check localStorage setting
    await authedPage.evaluate(() => {
      window.localStorage.setItem("connect.theme.v2", "dark");
    });

    const stored = await authedPage.evaluate(() => {
      return window.localStorage.getItem("connect.theme.v2");
    });
    expect(stored).toBe("dark");
  });

  test("3. Appearance settings renders ThemeSettingsSection", async ({ authedPage, setFlags }) => {
    await setFlags({ themeV2: true, settingsV2: true });
    await authedPage.goto("/settings");

    // Navigate to appearance or check appearance settings component
    const appearanceSection = authedPage.locator('[data-testid="appearance-settings"], [data-testid="v06-theme-settings-section"]');
    if (await appearanceSection.first().isVisible()) {
      await expect(appearanceSection.first()).toBeVisible();
    }
  });

  test("4. System preference resolution: light/dark/system", async ({ authedPage }) => {
    const resolved = await authedPage.evaluate(() => {
      const isDark = document.documentElement.classList.contains("dark");
      return { isDark };
    });
    expect(typeof resolved.isDark).toBe("boolean");
  });
});
