import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import {
  findWorkspaceRoot,
  loadRootEnvironmentFiles,
  mergeBootstrapEnv,
  resolveBootstrapEnvironment,
} from "./bootstrap-env";
import {
  loadBitwardenConfigFromPath,
  resolveBitwardenConfigPath,
} from "./config";
import { filterSecretsForTarget, getCandidateSecretsForTarget } from "./filter";
import { syncTargetSecrets } from "./sdk";
import { resolveRuntimeState } from "./state";

import type { DoctorTargetOptions } from "./types";

export interface DoctorResult {
  ok: boolean;
  lines: string[];
}

export async function doctorTarget(
  target: string,
  options: DoctorTargetOptions = {},
): Promise<DoctorResult> {
  const lines: string[] = [];
  const fail = (stage: string, error: unknown): DoctorResult => {
    lines.push(`[fail] ${stage}: ${formatError(error)}`);
    return { lines, ok: false };
  };

  let workspaceRoot: string;

  try {
    workspaceRoot = await resolveWorkspaceRoot(options.workspaceRoot);
    lines.push(`[ok] workspace discovery: root=${workspaceRoot}`);
  } catch (error) {
    return fail("workspace discovery", error);
  }

  let configPath: string;
  let config: Awaited<ReturnType<typeof loadBitwardenConfigFromPath>>;

  try {
    configPath = await resolveBitwardenConfigPath(workspaceRoot);
    config = await loadBitwardenConfigFromPath(configPath);
    lines.push(
      `[ok] config discovery/load: path=${configPath}, targets=${Object.keys(config.targets).length}`,
    );
  } catch (error) {
    return fail("config discovery/load", error);
  }

  const targetConfig = config.targets[target];

  if (!targetConfig) {
    lines.push(`[fail] target existence: Unknown Bitwarden target ${target}`);
    return { lines, ok: false };
  }

  lines.push(
    `[ok] target existence: target=${target}, projectIds=${targetConfig.projectIds.length}, includeKeys=${targetConfig.includeKeys.length}, excludeKeys=${targetConfig.excludeKeys.length}`,
  );

  let bootstrapEnv: NodeJS.ProcessEnv;
  let bootstrap: ReturnType<typeof resolveBootstrapEnvironment>;

  try {
    const rootEnv = await loadRootEnvironmentFiles(workspaceRoot);
    bootstrapEnv = mergeBootstrapEnv(options.env ?? process.env, rootEnv);
    bootstrap = resolveBootstrapEnvironment(
      config.bootstrap,
      bootstrapEnv,
      workspaceRoot,
    );
    lines.push(
      `[ok] bootstrap env presence: accessTokenEnv=${config.bootstrap.accessTokenEnv}, organizationIdEnv=${config.bootstrap.organizationIdEnv}, apiUrlEnv=${config.bootstrap.apiUrlEnv}${bootstrapEnv[config.bootstrap.apiUrlEnv] ? "" : " (default used)"}, identityUrlEnv=${config.bootstrap.identityUrlEnv}${bootstrapEnv[config.bootstrap.identityUrlEnv] ? "" : " (default used)"}`,
    );
  } catch (error) {
    return fail("bootstrap env presence", error);
  }

  const runtime = resolveRuntimeState(workspaceRoot, target, config.runtime, {
    persistState: options.persistState,
    stateDir: options.stateDir,
  });

  lines.push(
    `[ok] state resolution: persistState=${runtime.persistState} (${runtime.persistStateSource}), stateDir=${runtime.stateDir} (${runtime.stateDirSource}), stateFile=${runtime.stateFile}`,
  );

  let syncedSecrets: Awaited<ReturnType<typeof syncTargetSecrets>>;

  try {
    syncedSecrets = await syncTargetSecrets({
      bootstrap,
      runtime,
    });
    lines.push(`[ok] SDK login/sync access: syncedSecrets=${syncedSecrets.length}`);
  } catch (error) {
    return fail("SDK login/sync access", error);
  }

  const candidateSecrets = getCandidateSecretsForTarget(syncedSecrets, targetConfig);
  const mismatched = candidateSecrets.filter(
    (secret) => secret.organizationId !== bootstrap.organizationId,
  );

  if (mismatched.length > 0) {
    const details = mismatched
      .map((secret) => `${secret.key}:${secret.organizationId}`)
      .join(", ");
    lines.push(
      `[fail] organization match: expected=${bootstrap.organizationId}, mismatched=${details}`,
    );
    return { lines, ok: false };
  }

  lines.push(
    `[ok] organization match: candidateSecrets=${candidateSecrets.length}, organizationId=${bootstrap.organizationId}`,
  );

  try {
    const matched = filterSecretsForTarget(
      syncedSecrets,
      targetConfig,
      bootstrap.organizationId,
      target,
    );
    lines.push(
      `[ok] matched secret selection: count=${matched.length}, keys=${matched.map((secret) => secret.key).join(", ")}`,
    );
  } catch (error) {
    return fail("matched secret selection", error);
  }

  return { lines, ok: true };
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
