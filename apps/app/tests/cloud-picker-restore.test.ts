import { describe, expect, test } from "bun:test";
import {
  ANCHOR_CLOUD_KEY_HINT,
  ANCHOR_CLOUD_LABELS,
  anchorSessionBody,
  anchorTargetForPrefs,
  MANUS_CLOUD_KEY_HINT,
  ORACLE_CLOUD_GIB,
  pickerValueForPrefs,
  prefsPatchForPicker,
  RUNTIME_LABELS,
  SANDBOX_PICKER_OPTIONS,
} from "@/lib/agents/agent-computer";

describe("sandbox cloud picker restore", () => {
  test("lists Default, Azure, Oracle, and Manus even before any key exists", () => {
    const labels = SANDBOX_PICKER_OPTIONS.map((option) => option.label);
    expect(labels).toContain("Default Cloud");
    expect(labels).toContain("Azure Cloud");
    expect(labels).toContain("Oracle Cloud");
    expect(labels).toContain("Manus Cloud");
    expect(labels).toContain("PC (Ubuntu-Docker)");
    expect(labels).toContain("Smartphone");
    expect(RUNTIME_LABELS.manus).toBe("Manus Cloud");
    expect(RUNTIME_LABELS.local).toBe("PC (Ubuntu-Docker)");
  });

  test("Oracle and Azure stay visible options and only need the Anchor key to start", () => {
    const oracle = SANDBOX_PICKER_OPTIONS.find(
      (option) => option.value === "oracle-cloud",
    );
    const azure = SANDBOX_PICKER_OPTIONS.find(
      (option) => option.value === "azure-cloud",
    );
    const fallback = SANDBOX_PICKER_OPTIONS.find(
      (option) => option.value === "default-cloud",
    );
    expect(oracle?.needs).toBe("anchor");
    expect(azure?.needs).toBe("anchor");
    expect(fallback?.needs).toBe("anchor");
    expect(ANCHOR_CLOUD_KEY_HINT).toContain("API-Keys");
    expect(MANUS_CLOUD_KEY_HINT).toContain("API-Keys");
    expect(ANCHOR_CLOUD_LABELS.oracle).toBe("Oracle Cloud");
  });

  test("legacy large box without a target is Oracle; plain cloud stays Azure", () => {
    expect(anchorTargetForPrefs({ boxSize: "large" })).toBe("oracle");
    expect(
      pickerValueForPrefs({ runtime: "cloud", boxSize: "small" }),
    ).toBe("azure-cloud");
    expect(
      pickerValueForPrefs({ runtime: "cloud", boxSize: "large" }),
    ).toBe("oracle-cloud");
    expect(
      pickerValueForPrefs({
        runtime: "cloud",
        boxSize: "small",
        cloudTarget: "default",
      }),
    ).toBe("default-cloud");
  });

  test("Oracle Cloud starts the Anchor remote-box at the 24 GB tier", () => {
    const patch = prefsPatchForPicker("oracle-cloud");
    expect(patch.runtime).toBe("cloud");
    expect(patch.cloudTarget).toBe("oracle");
    expect(patch.boxSize).toBe("large");
    expect(
      anchorSessionBody({
        boxSize: patch.boxSize ?? "small",
        cloudTarget: patch.cloudTarget,
      }),
    ).toEqual({
      session: { initial_url: "about:blank" },
      boxSize: "large",
    });
    expect(ORACLE_CLOUD_GIB).toBe(24);
  });

  test("Default and Azure use the same Anchor session with smaller tiers", () => {
    const fallback = prefsPatchForPicker("default-cloud");
    const azure = prefsPatchForPicker("azure-cloud");
    expect(anchorSessionBody({
      boxSize: fallback.boxSize ?? "small",
      cloudTarget: fallback.cloudTarget,
    }).boxSize).toBe("small");
    expect(anchorSessionBody({
      boxSize: azure.boxSize ?? "medium",
      cloudTarget: azure.cloudTarget,
    }).boxSize).toBe("medium");
    expect(fallback.runtime).toBe("cloud");
    expect(azure.runtime).toBe("cloud");
  });
});
