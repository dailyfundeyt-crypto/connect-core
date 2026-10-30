import { describe, expect, it } from "bun:test";
import {
  decodeMessage,
  encodeMessage,
  isBrokerMessage,
  isClientMessage,
  type BrokerMessage,
  type ClientMessage,
} from "./broker/protocol";

describe("CLI-Broker Protocol", () => {
  it("encodes and decodes client auth message", () => {
    const msg: ClientMessage = { type: "auth", token: "secret-token-123" };
    const encoded = encodeMessage(msg);
    const decoded = decodeMessage<ClientMessage>(encoded);
    expect(decoded).toEqual(msg);
    expect(isClientMessage(decoded)).toBe(true);
    expect(isBrokerMessage(decoded)).toBe(false);
  });

  it("encodes and decodes spawn message with pty options", () => {
    const msg: ClientMessage = {
      type: "spawn",
      id: "session-42",
      cmd: "codex.cmd",
      args: ["--version"],
      cwd: "C:\\test\\workdir",
      env: { CODEX_HOME: "C:\\test\\home" },
      cols: 120,
      rows: 40,
      usePty: true,
    };
    const encoded = encodeMessage(msg);
    const decoded = decodeMessage<ClientMessage>(encoded);
    expect(decoded).toEqual(msg);
    expect(isClientMessage(decoded)).toBe(true);
  });

  it("encodes and decodes broker data and exit events", () => {
    const dataMsg: BrokerMessage = {
      type: "data",
      id: "session-42",
      data: "Hello from CLI\r\n",
    };
    const exitMsg: BrokerMessage = {
      type: "exit",
      id: "session-42",
      exitCode: 0,
    };

    expect(decodeMessage<BrokerMessage>(encodeMessage(dataMsg))).toEqual(dataMsg);
    expect(decodeMessage<BrokerMessage>(encodeMessage(exitMsg))).toEqual(exitMsg);
    expect(isBrokerMessage(dataMsg)).toBe(true);
    expect(isBrokerMessage(exitMsg)).toBe(true);
    expect(isClientMessage(dataMsg)).toBe(false);
  });

  it("throws on invalid JSON string", () => {
    expect(() => decodeMessage("not-json{")).toThrow();
  });
});
