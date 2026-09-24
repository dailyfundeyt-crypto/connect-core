import { describe, expect, test } from "bun:test";
import { desktopTelemetryProperties } from "./desktop-telemetry";

describe("desktop runtime metadata", () => {
  test("leaves ordinary server deployments untagged", () => {
    expect(desktopTelemetryProperties({})).toEqual({});
    expect(
      desktopTelemetryProperties({ CONNECT_DISTRIBUTION: "server" }),
    ).toEqual({});
  });

  test("carries only the shell's bounded metadata", () => {
    expect(
      desktopTelemetryProperties({
        CONNECT_DISTRIBUTION: "desktop",
        CONNECT_VERSION: "0.0.9",
        CONNECT_PLATFORM: "macos",
        CONNECT_ARCH: "aarch64",
        CONNECT_OS_VERSION: "15.6.1",
        CONNECT_ENGINE: "podman",
        OPENAI_API_KEY: "synthetic-secret",
        CPK_TELEMETRY_ID: "identity-belongs-in-the-transport",
        HOME: "/Users/private-name",
        CONNECT_BASE_URL: "https://private.example",
      }),
    ).toEqual({
      connect_distribution: "desktop",
      connect_version: "0.0.9",
      connect_platform: "macos",
      connect_arch: "aarch64",
      connect_os_version: "15.6.1",
      connect_engine: "podman",
    });
  });

  test.each([
    "/Users/private-name",
    "private.example",
    "1.2-private-name",
    "1.2\nsecret",
    "1.2\n",
    "1.2.3.4.5",
    "1".repeat(40),
  ])("rejects arbitrary text in every metadata field: %s", (value) => {
    expect(
      desktopTelemetryProperties({
        CONNECT_DISTRIBUTION: "desktop",
        CONNECT_VERSION: value,
        CONNECT_OS_VERSION: value,
        CONNECT_PLATFORM: value,
        CONNECT_ARCH: value,
        CONNECT_ENGINE: value,
      }),
    ).toEqual({ connect_distribution: "desktop" });
  });
});
