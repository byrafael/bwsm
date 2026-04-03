import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { BitwardenConfig } from "./types";

const DEFAULT_BOOTSTRAP_CONFIG = {
  accessTokenEnv: "BITWARDEN_SM_ACCESS_TOKEN",
  organizationIdEnv: "BITWARDEN_SM_ORGANIZATION_ID",
  apiUrlEnv: "BITWARDEN_SM_API_URL",
  identityUrlEnv: "BITWARDEN_SM_IDENTITY_URL",
} as const;

const targetConfigSchema = z.object({
  projectIds: z
    .array(z.string().uuid())
    .min(1, "Bitwarden targets must declare at least one project ID"),
  includeKeys: z.array(z.string().min(1)).default([]),
  excludeKeys: z.array(z.string().min(1)).default([]),
});

const bitwardenConfigSchema = z.object({
  bootstrap: z
    .object({
      accessTokenEnv: z
        .string()
        .min(1)
        .default(DEFAULT_BOOTSTRAP_CONFIG.accessTokenEnv),
      organizationIdEnv: z
        .string()
        .min(1)
        .default(DEFAULT_BOOTSTRAP_CONFIG.organizationIdEnv),
      apiUrlEnv: z.string().min(1).default(DEFAULT_BOOTSTRAP_CONFIG.apiUrlEnv),
      identityUrlEnv: z
        .string()
        .min(1)
        .default(DEFAULT_BOOTSTRAP_CONFIG.identityUrlEnv),
    })
    .default(DEFAULT_BOOTSTRAP_CONFIG),
  runtime: z
    .object({
      stateDir: z.string().min(1).optional(),
      persistState: z.boolean().optional(),
    })
    .optional(),
  targets: z
    .record(z.string(), targetConfigSchema)
    .superRefine((targets, ctx) => {
      const targetNames = Object.keys(targets);

      if (targetNames.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bitwarden config must declare at least one target.",
        });
      }

      for (const targetName of targetNames) {
        if (targetName.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Bitwarden target names must be non-empty.",
          });
        }
      }
    }),
});

export const bitwardenConfigFileNames = [
  "bitwarden.config.ts",
  "bitwarden.config.mts",
  "bitwarden.config.cts",
  "bitwarden.config.mjs",
  "bitwarden.config.js",
  "bitwarden.config.cjs",
] as const;

const require = createRequire(import.meta.url);

export async function loadBitwardenConfig(
  workspaceRoot = process.cwd(),
): Promise<BitwardenConfig> {
  const configPath = await resolveBitwardenConfigPath(workspaceRoot);
  return loadBitwardenConfigFromPath(configPath);
}

export async function resolveBitwardenConfigPath(
  workspaceRoot = process.cwd(),
): Promise<string> {
  for (const fileName of bitwardenConfigFileNames) {
    const configPath = join(workspaceRoot, fileName);

    if (await pathExists(configPath)) {
      return configPath;
    }
  }

  throw new Error(
    `Unable to find a Bitwarden config in ${workspaceRoot}. Supported filenames: ${bitwardenConfigFileNames.join(", ")}`,
  );
}

export async function loadBitwardenConfigFromPath(
  configPath: string,
): Promise<BitwardenConfig> {
  let importedModule: unknown;

  try {
    importedModule = await importConfigModule(configPath);
  } catch (error) {
    throw new Error(
      `Failed to load Bitwarden config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const configValue =
    importedModule &&
    typeof importedModule === "object" &&
    "default" in importedModule
      ? (importedModule as { default: unknown }).default
      : importedModule;

  return bitwardenConfigSchema.parse(configValue);
}

async function importConfigModule(configPath: string): Promise<unknown> {
  const configUrl = pathToFileURL(configPath).href;
  const extension = extname(configPath);

  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    const { require: tsxRequire } = await import("tsx/cjs/api");
    return tsxRequire(configPath, import.meta.url);
  }

  if (extension === ".cjs") {
    return require(configPath);
  }

  return import(configUrl);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
