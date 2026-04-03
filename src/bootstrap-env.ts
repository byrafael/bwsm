import { access, readFile, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";

import type { BitwardenBootstrapConfig, ResolvedBootstrapEnv } from "./types";

const DEFAULT_API_URL = "https://api.bitwarden.com";
const DEFAULT_IDENTITY_URL = "https://identity.bitwarden.com";
const dotenvLinePattern = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const bitwardenConfigFileNames = [
  "bitwarden.config.ts",
  "bitwarden.config.mts",
  "bitwarden.config.cts",
  "bitwarden.config.mjs",
  "bitwarden.config.js",
  "bitwarden.config.cjs",
] as const;

export async function findWorkspaceRoot(
  startDir = process.cwd(),
): Promise<string> {
  let currentDir = startDir;

  while (true) {
    for (const fileName of bitwardenConfigFileNames) {
      if (await pathExists(join(currentDir, fileName))) {
        return realpath(currentDir);
      }
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Unable to locate workspace root from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

export async function loadRootEnvironmentFiles(
  workspaceRoot: string,
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(workspaceRoot, fileName);

    if (!(await pathExists(filePath))) {
      continue;
    }

    Object.assign(merged, parseDotenv(await readFile(filePath, "utf8")));
  }

  return merged;
}

export function mergeBootstrapEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
  rootEnv: Record<string, string>,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(rootEnv)) {
    merged[key] = value;
  }

  for (const [key, value] of Object.entries(processEnv)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return merged;
}

export function parseDotenv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(dotenvLinePattern);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (!key) {
      continue;
    }

    parsed[key] = normalizeEnvValue(rawValue ?? "");
  }

  return parsed;
}

export function resolveBootstrapEnvironment(
  config: BitwardenBootstrapConfig,
  processEnv: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): ResolvedBootstrapEnv {
  const accessToken = processEnv[config.accessTokenEnv];
  const organizationId = processEnv[config.organizationIdEnv];

  if (!accessToken) {
    throw new Error(
      `Missing required Bitwarden bootstrap env var ${config.accessTokenEnv}`,
    );
  }

  if (!organizationId) {
    throw new Error(
      `Missing required Bitwarden bootstrap env var ${config.organizationIdEnv}`,
    );
  }

  return {
    accessToken,
    apiUrl: processEnv[config.apiUrlEnv] || DEFAULT_API_URL,
    config,
    identityUrl: processEnv[config.identityUrlEnv] || DEFAULT_IDENTITY_URL,
    organizationId,
    workspaceRoot,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unwrapped = trimmed.slice(1, -1);

    if (trimmed.startsWith('"')) {
      return unwrapped
        .replaceAll("\\n", "\n")
        .replaceAll("\\r", "\r")
        .replaceAll("\\t", "\t")
        .replaceAll('\\"', '"')
        .replaceAll("\\\\", "\\");
    }

    return unwrapped;
  }

  return trimmed;
}
