import { describe, expect, it } from "bun:test";
import {
  quoteCmdArg,
  buildSafeWindowsCommandLine,
  validateSafeUrl,
  safeSpawn,
} from "./safeSpawn";

describe("Security – safeSpawn & Argument Quoting (SEC-01 & SEC-07)", () => {
  describe("quoteCmdArg", () => {
    it("leaves safe alphanumerics unquoted", () => {
      expect(quoteCmdArg("hello")).toBe("hello");
      expect(quoteCmdArg("test123_abc")).toBe("test123_abc");
    });

    it("quotes arguments containing spaces", () => {
      expect(quoteCmdArg("hello world")).toBe('"hello world"');
    });

    it("escapes embedded double quotes by doubling them", () => {
      expect(quoteCmdArg('foo"bar')).toBe('"foo""bar"');
      expect(quoteCmdArg('test" & calc.exe & "')).toBe('"test"" & calc.exe & """');
    });

    it("quotes shell metacharacters (&, |, <, >, ^, %, !)", () => {
      expect(quoteCmdArg("a&b")).toBe('"a&b"');
      expect(quoteCmdArg("a|b")).toBe('"a|b"');
      expect(quoteCmdArg("a>b")).toBe('"a>b"');
      expect(quoteCmdArg("%PATH%")).toBe('"%PATH%"');
    });

    it("handles empty string", () => {
      expect(quoteCmdArg("")).toBe('""');
    });

    it("rejects arguments with null bytes", () => {
      expect(() => quoteCmdArg("foo\0bar")).toThrow("illegal null bytes");
    });
  });

  describe("buildSafeWindowsCommandLine", () => {
    it("assembles safely quoted command lines without breakout", () => {
      const line = buildSafeWindowsCommandLine("echo", [
        "foo",
        "bar baz",
        'injected" & calc.exe & "',
      ]);
      expect(line).toBe('echo foo "bar baz" "injected"" & calc.exe & """');
    });

    it("throws if command contains null bytes", () => {
      expect(() => buildSafeWindowsCommandLine("cmd\0.exe", ["arg"])).toThrow("illegal null bytes");
    });
  });

  describe("validateSafeUrl (SEC-07)", () => {
    it("accepts valid http and https URLs", () => {
      expect(validateSafeUrl("https://example.com").valid).toBe(true);
      expect(validateSafeUrl("http://localhost:3101/api/health").valid).toBe(true);
    });

    it("rejects malicious protocols like file: or javascript:", () => {
      const resFile = validateSafeUrl("file:///C:/Windows/System32/cmd.exe");
      expect(resFile.valid).toBe(false);
      expect(resFile.error).toContain("Prohibited protocol");

      const resJs = validateSafeUrl("javascript:alert(1)");
      expect(resJs.valid).toBe(false);
    });

    it("rejects command line switches or shell characters in URLs", () => {
      expect(validateSafeUrl("/c calc.exe").valid).toBe(false);
      expect(validateSafeUrl("https://example.com & calc.exe").valid).toBe(false);
      expect(validateSafeUrl('https://example.com" | whoami').valid).toBe(false);
      expect(validateSafeUrl("https://example.com\ncalc.exe").valid).toBe(false);
    });
  });

  describe("safeSpawn", () => {
    it("throws on null bytes in executable or args", () => {
      expect(() => safeSpawn("cmd\0.exe", [])).toThrow("illegal null bytes");
      expect(() => safeSpawn("echo", ["foo\0bar"])).toThrow("illegal null bytes");
    });

    it("spawns a safe process with array arguments and shell:false by default", async () => {
      const proc = safeSpawn(
        process.platform === "win32" ? "cmd.exe" : "echo",
        process.platform === "win32" ? ["/c", "echo", "safeTest"] : ["safeTest"],
      );
      expect(proc.pid).toBeDefined();

      let output = "";
      proc.stdout?.on("data", (d) => {
        output += d.toString();
      });

      await new Promise<void>((resolve) => proc.on("close", () => resolve()));
      expect(output).toContain("safeTest");
    });
  });
});
