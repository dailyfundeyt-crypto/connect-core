import { describe, expect, it } from "bun:test";
import {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  formatFreebuffInput,
  isBracketedPaste,
  stripBracketedPaste,
  wrapBracketedPaste,
} from "./freebuffInput";

describe("Freebuff Input Formatter", () => {
  it("formats single-line input with trailing carriage return \\r", () => {
    const res = formatFreebuffInput("hello world");
    expect(res).toBe("hello world\r");
  });

  it("replaces existing \\n or \\r\\n at end with single \\r", () => {
    expect(formatFreebuffInput("test line\n")).toBe("test line\r");
    expect(formatFreebuffInput("test line\r\n")).toBe("test line\r");
  });

  it("passes raw input unchanged when raw=true", () => {
    const rawArrowUp = "\x1b[A";
    expect(formatFreebuffInput(rawArrowUp, { raw: true })).toBe(rawArrowUp);
    const rawCtrlC = "\x03";
    expect(formatFreebuffInput(rawCtrlC, { raw: true })).toBe(rawCtrlC);
  });

  it("wraps multiline text in bracketed paste mode", () => {
    const multi = "line 1\nline 2\nline 3";
    const res = formatFreebuffInput(multi);
    expect(res.startsWith(BRACKETED_PASTE_START)).toBe(true);
    expect(res.endsWith(`${BRACKETED_PASTE_END}\r`)).toBe(true);
    expect(res).toContain("line 1\rline 2\rline 3");
  });

  it("handles explicit isPaste option", () => {
    const pasted = "pasted content";
    const res = formatFreebuffInput(pasted, { isPaste: true });
    expect(res).toBe(`${BRACKETED_PASTE_START}pasted content${BRACKETED_PASTE_END}`);
    expect(isBracketedPaste(res)).toBe(true);
  });

  it("does not double-wrap text already in bracketed paste", () => {
    const alreadyWrapped = `${BRACKETED_PASTE_START}code block${BRACKETED_PASTE_END}`;
    expect(formatFreebuffInput(alreadyWrapped)).toBe(alreadyWrapped);
    expect(stripBracketedPaste(alreadyWrapped)).toBe("code block");
  });
});
