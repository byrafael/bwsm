import { realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { constants as osConstants } from "node:os";
import { resolve } from "node:path";

import {
  findWorkspaceRoot,
  loadRootEnvironmentFiles,
  mergeBootstrapEnv,
  resolveBootstrapEnvironment,
} from "./bootstrap-env";
import { loadBitwardenConfig } from "./config";
import { buildInjectedEnvironment, filterSecretsForTarget } from "./filter";
import { syncTargetSecrets } from "./sdk";
import { clearPersistedStateFile, resolveRuntimeState } from "./state";

import type {
  InjectSecretsForTargetOptions,
  LoadedSecretsResult,
  LoadSecretsForTargetOptions,
  LogoutTargetStateOptions,
  RunWithSecretsOptions,
} from "./types";

export async function loadSecretsForTarget(
  target: string,
  options: LoadSecretsForTargetOptions = {},
): Promise<LoadedSecretsResult> {
  const workspaceRoot = await resolveWorkspaceRoot(options.workspaceRoot);
  const config = await loadBitwardenConfig(workspaceRoot);
  const targetConfig = config.targets[target];

  if (!targetConfig) {
    throw new Error(`Unknown Bitwarden target ${target}`);
  }

  const rootEnv = await loadRootEnvironmentFiles(workspaceRoot);
  const bootstrapEnv = mergeBootstrapEnv(options.env ?? process.env, rootEnv);
  const bootstrap = resolveBootstrapEnvironment(
    config.bootstrap,
    bootstrapEnv,
    workspaceRoot,
  );
  const runtime = resolveRuntimeState(workspaceRoot, target, config.runtime, {
    persistState: options.persistState,
    stateDir: options.stateDir,
  });
  const syncedSecrets = await syncTargetSecrets({
    bootstrap,
    runtime,
  });
  const secrets = filterSecretsForTarget(
    syncedSecrets,
    targetConfig,
    bootstrap.organizationId,
    target,
  );
  const injected = buildInjectedEnvironment(secrets, {});

  return {
    env: injected.env,
    hash: injected.hash,
    keys: injected.keys,
    secrets,
    target,
    targetConfig,
    workspaceRoot,
  };
}

export async function injectSecretsForTarget(
  target: string,
  options: InjectSecretsForTargetOptions = {},
): Promise<{ env: Record<string, string>; hash: string; keys: string[] }> {
  const loadedSecrets = await loadSecretsForTarget(target, {
    env: options.env,
    persistState: options.persistState,
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
  });
  const injected = buildInjectedEnvironment(
    loadedSecrets.secrets,
    options.baseEnv ?? process.env,
  );

  injected.env.BWSM_ENV_HASH = injected.hash;
  injected.env.BWSM_TARGET = target;

  return injected;
}

export async function runWithSecrets(
  target: string,
  command: string[],
  options: RunWithSecretsOptions = {},
): Promise<number> {
  if (command.length === 0) {
    throw new Error("Missing command to run");
  }

  const { env } = await injectSecretsForTarget(target, {
    baseEnv: options.baseEnv ?? process.env,
    env: options.env ?? process.env,
    persistState: options.persistState,
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
  });
  const child = spawn(command[0] ?? "", command.slice(1), {
    cwd: options.cwd ?? process.cwd(),
    env,
    shell: false,
    stdio: "inherit",
  });

  const [exitCode, signalCode] = await Promise.race([
    once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>,
    once(child, "error").then(([error]) => {
      throw error;
    }),
  ]);

  if (typeof signalCode === "string") {
    const signalNumber = osConstants.signals[signalCode];

    if (typeof signalNumber === "number") {
      return 128 + signalNumber;
    }
  }

  return exitCode ?? 0;
}

export async function logoutTargetState(
  target: string,
  options: LogoutTargetStateOptions = {},
): Promise<{ removed: boolean; pruned: boolean; stateDir: string; stateFile: string }> {
  const workspaceRoot = await resolveWorkspaceRoot(options.workspaceRoot);
  const config = await loadBitwardenConfig(workspaceRoot);
  const runtime = resolveRuntimeState(workspaceRoot, target, config.runtime, {
    persistState: true,
    stateDir: options.stateDir,
  });
  const cleared = await clearPersistedStateFile(runtime);

  return {
    ...cleared,
    stateDir: runtime.stateDir,
    stateFile: runtime.stateFile,
  };
}

async function resolveWorkspaceRoot(workspaceRoot?: string): Promise<string> {
  if (!workspaceRoot) {
    return findWorkspaceRoot();
  }

  const absolutePath = resolve(workspaceRoot);

  try {
    return await realpath(absolutePath);
  } catch {
    return absolutePath;
  }
}
