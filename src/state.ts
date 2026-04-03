import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

import type { BitwardenRuntimeConfig } from "./types";

const DEFAULT_STATE_DIR_RELATIVE = ".cache/bitwarden-sm/state";
const STATE_DIR_MODE = 0o700;
const STATE_FILE_MODE = 0o600;

type ResolutionSource = "option" | "config" | "default";

export interface RuntimeStateOptions {
  stateDir?: string;
  persistState?: boolean;
}

export interface ResolvedRuntimeState {
  persistState: boolean;
  persistStateSource: ResolutionSource;
  stateDir: string;
  stateDirSource: ResolutionSource;
  stateFile: string;
}

export function resolveRuntimeState(
  workspaceRoot: string,
  target: string,
  configRuntime: BitwardenRuntimeConfig | undefined,
  options: RuntimeStateOptions = {},
): ResolvedRuntimeState {
  const persistState =
    options.persistState ?? configRuntime?.persistState ?? true;
  const persistStateSource: ResolutionSource =
    options.persistState !== undefined
      ? "option"
      : configRuntime?.persistState !== undefined
        ? "config"
        : "default";

  const rawStateDir =
    options.stateDir ??
    configRuntime?.stateDir ??
    join(workspaceRoot, DEFAULT_STATE_DIR_RELATIVE);
  const stateDirSource: ResolutionSource =
    options.stateDir !== undefined
      ? "option"
      : configRuntime?.stateDir !== undefined
        ? "config"
        : "default";
  const stateDir = isAbsolute(rawStateDir)
    ? rawStateDir
    : resolve(workspaceRoot, rawStateDir);
  const stateFile = join(stateDir, `${sanitizeTargetName(target)}.json`);

  return {
    persistState,
    persistStateSource,
    stateDir,
    stateDirSource,
    stateFile,
  };
}

export function sanitizeTargetName(target: string): string {
  const sanitized = target.trim().replaceAll(/[^A-Za-z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "target";
}

export async function withRuntimeStateFile<T>(
  state: ResolvedRuntimeState,
  action: (stateFilePath: string) => Promise<T>,
): Promise<T> {
  if (state.persistState) {
    await ensurePersistentStateDirectory(state.stateDir);

    try {
      return await action(state.stateFile);
    } finally {
      await applyPosixPermissions(state.stateFile, STATE_FILE_MODE);
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), "bwsm-state-"));
  const tempStateFile = join(tempDir, basename(state.stateFile));

  try {
    return await action(tempStateFile);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function clearPersistedStateFile(
  state: ResolvedRuntimeState,
): Promise<{ removed: boolean; pruned: boolean }> {
  let removed = false;

  try {
    await unlink(state.stateFile);
    removed = true;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  let pruned = false;

  try {
    const children = await readdir(state.stateDir);

    if (children.length === 0) {
      await rm(state.stateDir, { recursive: true });
      pruned = true;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  return { removed, pruned };
}

async function ensurePersistentStateDirectory(stateDir: string): Promise<void> {
  if (process.platform === "win32") {
    await mkdir(stateDir, { recursive: true });
    return;
  }

  await mkdir(stateDir, { mode: STATE_DIR_MODE, recursive: true });
  await applyPosixPermissions(stateDir, STATE_DIR_MODE);
}

async function applyPosixPermissions(
  filePath: string,
  mode: number,
): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  try {
    await chmod(filePath, mode);
  } catch {
    // Permission changes are best-effort and may not be supported.
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
