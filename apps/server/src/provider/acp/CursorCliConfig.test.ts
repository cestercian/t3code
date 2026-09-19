// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  detectDeprecatedCursorCliJsonKeys,
  formatCursorAcpStartFailureDetail,
  formatDeprecatedCursorCliJsonMessage,
  MAX_CURSOR_CLI_JSON_BYTES,
  readDeprecatedCursorCliJsonKeys,
} from "./CursorCliConfig.ts";

describe("CursorCliConfig", () => {
  it("detects known deprecated top-level cli.json keys", () => {
    expect(
      detectDeprecatedCursorCliJsonKeys(
        JSON.stringify({
          approvalMode: "unrestricted",
          sandbox: { mode: "disabled" },
          permissions: { allow: ["Shell(**)"] },
        }),
      ),
    ).toEqual(["approvalMode", "sandbox"]);
  });

  it("ignores invalid JSON and unknown keys", () => {
    expect(detectDeprecatedCursorCliJsonKeys("{")).toEqual([]);
    expect(detectDeprecatedCursorCliJsonKeys(JSON.stringify({ model: "default" }))).toEqual([]);
  });

  it("reads deprecated keys from a project .cursor/cli.json", async () => {
    const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "cursor-cli-config-"));
    NodeFS.mkdirSync(NodePath.join(cwd, ".cursor"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(cwd, ".cursor", "cli.json"),
      JSON.stringify({ autoRun: true, sandbox: { type: "insecure_none" } }),
      "utf8",
    );
    expect(await readDeprecatedCursorCliJsonKeys(cwd)).toEqual(["autoRun", "sandbox"]);
    expect(await readDeprecatedCursorCliJsonKeys(NodePath.join(cwd, "missing"))).toEqual([]);
  });

  it("skips oversized or non-regular .cursor/cli.json files", async () => {
    const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "cursor-cli-config-"));
    const cursorDir = NodePath.join(cwd, ".cursor");
    NodeFS.mkdirSync(cursorDir, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(cursorDir, "cli.json"),
      `${"x".repeat(MAX_CURSOR_CLI_JSON_BYTES + 1)}`,
      "utf8",
    );
    expect(await readDeprecatedCursorCliJsonKeys(cwd)).toEqual([]);

    const specialCwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "cursor-cli-config-"));
    NodeFS.mkdirSync(NodePath.join(specialCwd, ".cursor", "cli.json"), { recursive: true });
    expect(await readDeprecatedCursorCliJsonKeys(specialCwd)).toEqual([]);
  });

  it("names the rejected keys and the sibling files they moved to", () => {
    const message = formatDeprecatedCursorCliJsonMessage(["approvalMode", "sandbox"]);
    expect(message).toContain("approvalMode");
    expect(message).toContain("sandbox");
    expect(message).toContain(".cursor/permissions.json");
    expect(message).toContain(".cursor/sandbox.json");
    expect(message).toContain("insecure_none");
  });

  it("prepends migration advice to a process-exit excerpt", () => {
    const detail = formatCursorAcpStartFailureDetail({
      deprecatedKeys: ["approvalMode"],
      processDetail: "ACP process exited with code 1\nUnrecognized key(s): 'approvalMode'",
    });
    expect(detail).toContain("permissions.json");
    expect(detail).toContain("Unrecognized key(s): 'approvalMode'");
  });
});
