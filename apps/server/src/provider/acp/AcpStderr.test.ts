import { describe, expect, it } from "vite-plus/test";
import * as EffectAcpErrors from "effect-acp/errors";

import {
  ACP_STDERR_TAIL_MAX_CHARS,
  appendAcpStderrTail,
  formatAcpProcessExitDetail,
  sanitizeAcpStderrExcerpt,
} from "./AcpStderr.ts";

describe("AcpStderr", () => {
  it("keeps a bounded tail of stderr chunks", () => {
    const prefix = "x".repeat(ACP_STDERR_TAIL_MAX_CHARS);
    expect(appendAcpStderrTail(prefix, "abc")).toBe(`${prefix.slice(3)}abc`);
  });

  it("redacts home paths, pairing URLs, and tokens from stderr excerpts", () => {
    const excerpt = sanitizeAcpStderrExcerpt(
      [
        "Invalid project config at /Users/ada/.cursor/cli.json",
        "Authorization: Bearer secret-token-value",
        "Visit http://localhost:5733/pair#token=ABCDEF for pairing",
        "key=sk-abcdefghijklmnopqrstuv",
      ].join("\n"),
      { HOME: "/Users/ada" },
    );

    expect(excerpt).toContain("Invalid project config at ~/.cursor/cli.json");
    expect(excerpt).toContain("Bearer [redacted]");
    expect(excerpt).toContain("[pairing-url]");
    expect(excerpt).toContain("[redacted]");
    expect(excerpt).not.toContain("secret-token-value");
    expect(excerpt).not.toContain("ABCDEF");
    expect(excerpt).not.toContain("sk-abcdefghijklmnopqrstuv");
  });

  it("includes a stderr excerpt on process-exit detail", () => {
    expect(
      formatAcpProcessExitDetail(
        new EffectAcpErrors.AcpProcessExitedError({
          code: 1,
          stderr:
            "Invalid project config at ~/.cursor/cli.json: Unrecognized key(s): 'approvalMode'",
        }),
      ),
    ).toContain("Unrecognized key(s): 'approvalMode'");
  });
});
