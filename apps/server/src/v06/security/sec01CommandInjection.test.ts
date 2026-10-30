import { describe, expect, it } from "bun:test";
import { buildSafeWindowsCommandLine, quoteCmdArg } from "./safeSpawn";
import { RunasDeElevator } from "../cli-runner/deelevate";

describe("SEC-01: Command Injection Guard in RunasDeElevator", () => {
  it("escapes command injection payloads with shell metacharacters (&, |, ;)", () => {
    const maliciousArgs = ['hello" & calc.exe & "', "world|whoami", "foo;bar", "%TEMP%"];
    const cmdLine = buildSafeWindowsCommandLine("echo", maliciousArgs);

    // Verify quotes are doubled and characters are safely encased
    expect(cmdLine).toContain('"hello"" & calc.exe & """');
    expect(cmdLine).toContain('"world|whoami"');
    expect(cmdLine).toContain('"foo;bar"');
    expect(cmdLine).toContain('"%TEMP%"');

    // Verify individual args are quoted when containing metacharacters
    for (const arg of maliciousArgs) {
      expect(quoteCmdArg(arg).startsWith('"')).toBe(true);
      expect(quoteCmdArg(arg).endsWith('"')).toBe(true);
    }
  });

  it("rejects command injection attempts with null bytes", () => {
    expect(() => buildSafeWindowsCommandLine("cmd.exe\0injected", [])).toThrow("null bytes");
    expect(() => buildSafeWindowsCommandLine("cmd.exe", ["arg\0injected"])).toThrow("null bytes");
  });

  it("RunasDeElevator exposes buildCommandLine or uses safe escaping", () => {
    const elevator = new RunasDeElevator();
    // Test that RunasDeElevator has safe command construction
    expect(typeof (elevator as any).buildSafeCommand).toBe("function");
    const safeCmd = (elevator as any).buildSafeCommand("echo", ['test" & calc.exe']);
    expect(safeCmd).toContain('test"" & calc.exe');
  });
});
