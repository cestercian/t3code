// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off
import * as NodeFS from "node:fs/promises";
import * as NodePath from "node:path";

export const DEPRECATED_CURSOR_CLI_JSON_KEYS = ["approvalMode", "autoRun", "sandbox"] as const;

/** Workspace cli.json is only used to name deprecated keys; skip huge or special files. */
export const MAX_CURSOR_CLI_JSON_BYTES = 64 * 1024;

export type DeprecatedCursorCliJsonKey = (typeof DEPRECATED_CURSOR_CLI_JSON_KEYS)[number];

export async function readDeprecatedCursorCliJsonKeys(
  cwd: string,
): Promise<ReadonlyArray<DeprecatedCursorCliJsonKey>> {
  const filePath = NodePath.join(cwd, ".cursor", "cli.json");
  try {
    const stats = await NodeFS.stat(filePath);
    if (!stats.isFile() || stats.size > MAX_CURSOR_CLI_JSON_BYTES) {
      return [];
    }
    const contents = await NodeFS.readFile(filePath);
    if (contents.byteLength > MAX_CURSOR_CLI_JSON_BYTES) {
      return [];
    }
    return detectDeprecatedCursorCliJsonKeys(contents.toString("utf8"));
  } catch {
    return [];
  }
}

export function detectDeprecatedCursorCliJsonKeys(
  contents: string,
): ReadonlyArray<DeprecatedCursorCliJsonKey> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  return DEPRECATED_CURSOR_CLI_JSON_KEYS.filter((key) => Object.hasOwn(parsed, key));
}

export function formatDeprecatedCursorCliJsonMessage(
  keys: ReadonlyArray<string>,
): string | undefined {
  if (keys.length === 0) {
    return undefined;
  }
  const named = keys.join(", ");
  const advice: string[] = [];
  if (keys.includes("approvalMode") || keys.includes("autoRun")) {
    advice.push("move approvalMode / autoRun to .cursor/permissions.json");
  }
  if (keys.includes("sandbox")) {
    advice.push('move sandbox to .cursor/sandbox.json (for example {"type": "insecure_none"})');
  }
  const suggestion =
    advice.length > 0 ? ` ${advice.join("; ")}.` : " Move them to the current cursor-agent files.";
  return `Project .cursor/cli.json has deprecated keys: ${named}.${suggestion} Remove those keys from cli.json and retry.`;
}

export function formatCursorAcpStartFailureDetail(input: {
  readonly deprecatedKeys: ReadonlyArray<string>;
  readonly processDetail: string;
}): string {
  const migration = formatDeprecatedCursorCliJsonMessage(input.deprecatedKeys);
  if (!migration) {
    return input.processDetail;
  }
  return input.processDetail.includes(migration)
    ? input.processDetail
    : `${migration}\n\n${input.processDetail}`;
}
