import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";
import type { McpServerConfig, McpServerEntry } from "./types";
import { readOpencodeConfig, writeOpencodeConfig } from "./lib/desktop";

type McpConfigValue = Record<string, unknown> | null | undefined;

type McpIdentity = {
  id?: string;
  serverName?: string;
  name: string;
};

export function normalizeMcpSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function getMcpIdentityKey(entry: McpIdentity): string {
  return entry.id ?? entry.serverName ?? normalizeMcpSlug(entry.name);
}

export function validateMcpServerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("server_name is required");
  }
  if (trimmed.startsWith("-")) {
    throw new Error("server_name must not start with '-'");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error("server_name must be alphanumeric with '-' or '_'");
  }
  return trimmed;
}

const ENV_REFERENCE_RE = /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Env vars referenced via {env:VAR} placeholders in a directory entry's
 * command args and static environment values. */
export function collectReferencedEnvVars(entry: { command?: string[]; environment?: Record<string, string> }): string[] {
  const found = new Set<string>();
  for (const part of entry.command ?? []) {
    for (const match of part.matchAll(ENV_REFERENCE_RE)) found.add(match[1]);
  }
  for (const value of Object.values(entry.environment ?? {})) {
    for (const match of value.matchAll(ENV_REFERENCE_RE)) found.add(match[1]);
  }
  return [...found];
}

export async function removeMcpFromConfig(
  projectDir: string,
  name: string,
): Promise<void> {
  const configFile = await readOpencodeConfig("project", projectDir) as { path: string; exists: boolean; content: string | null };
  const raw = configFile.exists && configFile.content?.trim()
    ? configFile.content
    : "{}\n";

  const parseErrors: Array<{ error: number; offset: number; length: number }> = [];
  const existingConfig = parse(raw, parseErrors, { allowTrailingComma: true }) as Record<string, unknown> | undefined;
  if (parseErrors.length > 0) {
    const details = parseErrors
      .map((entry) => printParseErrorCode(entry.error))
      .join(", ");
    throw new Error(`Failed to parse opencode config: ${details}`);
  }

  const mcpSection = existingConfig?.["mcp"] as Record<string, unknown> | undefined;
  if (!mcpSection || !(name in mcpSection)) return;

  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
  const updated = applyEdits(raw, modify(raw, ["mcp", name], undefined, { formattingOptions }));
  const writeResult = await writeOpencodeConfig(
    "project",
    projectDir,
    updated.endsWith("\n") ? updated : `${updated}\n`,
  ) as { ok: boolean; stderr?: string; stdout?: string };
  if (!writeResult.ok) {
    throw new Error(writeResult.stderr || writeResult.stdout || "Failed to write opencode.json");
  }
}

export function parseMcpServersFromContent(content: string): McpServerEntry[] {
  if (!content.trim()) return [];

  try {
    const parsed = parse(content) as Record<string, unknown> | undefined;
    const mcp = parsed?.mcp as McpConfigValue;

    if (!mcp || typeof mcp !== "object") {
      return [];
    }

    return Object.entries(mcp).flatMap(([name, value]) => {
      if (!value || typeof value !== "object") {
        return [];
      }

      const config = value as McpServerConfig;
      if (config.type !== "remote" && config.type !== "local") {
        return [];
      }

      return [{ name, config, source: "config.project" as const }];
    });
  } catch {
    return [];
  }
}
