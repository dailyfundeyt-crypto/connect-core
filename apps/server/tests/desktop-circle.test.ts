import { expect, test, describe } from "bun:test";
import {
  analyzeCircle,
  applyHeuristicCircleEngine,
  createCircleRouter,
} from "../src/desktop/circle";
import type { CircleAnalyzeRequest } from "../../../packages/shared/src/desktop/contracts";

describe("Circle to ask - Server Analysis Engine", () => {
  test("Steam-ähnliche Seite einkreisen + 'öffne die Store-Seite' -> richtige URL", async () => {
    const request: CircleAnalyzeRequest = {
      windowTitle: "Counter-Strike 2 - Steam",
      textPrompt: "öffne die Store-Seite",
      uiaElements: [
        { name: "Counter-Strike 2", role: "Header" },
        { name: "Jetzt spielen", role: "Button" },
        { name: "Community-Hub", role: "Link" },
      ],
    };

    const response = await analyzeCircle(request);

    expect(response.intent).toBe("open_store_page");
    expect(response.interpretation).toContain("Steam-Store-Seite");
    expect(response.plan.length).toBe(1);

    const action = response.plan[0];
    expect(action.type).toBe("open_url");
    expect(action.openUrl).toBeDefined();
    expect(action.openUrl?.url).toContain("store.steampowered.com");
    expect(action.openUrl?.url).toContain("Counter-Strike%202");
    expect(action.openUrl?.preferHelium).toBe(true);
    expect(response.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("Steam Store-Seite mit expliziter App-ID in Elementen", async () => {
    const request: CircleAnalyzeRequest = {
      windowTitle: "Steam",
      textPrompt: "Store-Seite öffnen",
      uiaElements: [
        { name: "Hades II app/1145350", role: "Text" },
        { name: "Kaufen", role: "Button" },
      ],
    };

    const response = await analyzeCircle(request);

    expect(response.intent).toBe("open_store_page");
    expect(response.plan.length).toBe(1);
    expect(response.plan[0].openUrl?.url).toBe("https://store.steampowered.com/app/1145350/");
  });

  test("Frage -> Antwortkarte (Informational intent, kein destruktiver Plan)", async () => {
    const request: CircleAnalyzeRequest = {
      windowTitle: "Helium Browser - Wikipedia",
      textPrompt: "Was ist das hier markierte?",
      uiaElements: [
        { name: "Saturn V Rakete", role: "Heading" },
        { name: "dreistufige Flüssigkeitsrakete", fuzzyText: "Erklärung", role: "Text" },
      ],
    };

    const response = await analyzeCircle(request);

    expect(response.intent).toBe("answer");
    expect(response.interpretation).toContain("Saturn V Rakete");
    expect(response.plan.length).toBe(0);
    expect(response.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("Klick-Aufforderung -> Click-Aktion mit Selector", async () => {
    const request: CircleAnalyzeRequest = {
      windowTitle: "Helium Browser",
      textPrompt: "klick auf den Download Button",
      uiaElements: [
        { name: "Download", role: "Button", index: 0 },
        { name: "Abbrechen", role: "Button", index: 1 },
      ],
    };

    const response = await analyzeCircle(request);

    expect(response.intent).toBe("click_element");
    expect(response.plan.length).toBe(1);
    expect(response.plan[0].type).toBe("click");
    expect(response.plan[0].click?.selector?.name).toBe("Download");
    expect(response.plan[0].click?.selector?.role).toBe("Button");
  });

  test("Hono Router POST /api/desktop/circle verarbeitet Request korrekt", async () => {
    const router = createCircleRouter();

    const requestBody: CircleAnalyzeRequest = {
      windowTitle: "Steam - Cyberpunk 2077",
      textPrompt: "öffne die Store-Seite",
      uiaElements: [{ name: "Cyberpunk 2077", role: "Heading" }],
    };

    const req = new Request("http://localhost/circle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await router.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.intent).toBe("open_store_page");
    expect(json.plan[0].openUrl.url).toContain("store.steampowered.com");
  });

  test("Hono Router lehnt ungültigen Payload mit HTTP 400 ab", async () => {
    const router = createCircleRouter();

    const req = new Request("http://localhost/circle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Missing both valid structure or invalid types
        imageBase64: 12345, // invalid type
      }),
    });

    const res = await router.fetch(req);
    expect(res.status).toBe(400);
  });
});
