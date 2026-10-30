import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ControlToggle } from "@/components/control-toggle";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe("ControlToggle liveToggleOnly flag behavior (A02)", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnv;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  test("Wenn FLAGS_V06.liveToggleOnly aus ist (Default), wird ControlToggle gerendert", () => {
    delete process.env.CONNECT_FLAGS_V06;
    const { container } = render(<ControlToggle active={false} />);
    const button = container.querySelector("button[data-testid='control-toggle']");
    expect(button).not.toBeNull();
  });

  test("Wenn FLAGS_V06.liveToggleOnly an ist, wird der Button 'Steuerung uebernehmen' ausgeblendet (null)", () => {
    process.env.CONNECT_FLAGS_V06 = "livetoggleonly";
    const { container } = render(<ControlToggle active={false} />);
    const button = container.querySelector("button[data-testid='control-toggle']");
    expect(button).toBeNull();
  });
});
