import { createHash } from "node:crypto";

import type { BitwardenTargetConfig, ResolvedSecret } from "./types";

const envNamePattern = /^[A-Z_][A-Z0-9_]*$/;

export interface InjectedEnvironmentResult {
  env: Record<string, string>;
  hash: string;
  keys: string[];
}

export function getCandidateSecretsForTarget(
  secrets: ResolvedSecret[],
  targetConfig: BitwardenTargetConfig,
): ResolvedSecret[] {
  const includedProjectIds = new Set(targetConfig.projectIds);
  const includedKeys = new Set(targetConfig.includeKeys);
  const excludedKeys = new Set(targetConfig.excludeKeys);
  const selected: ResolvedSecret[] = [];

  for (const secret of secrets) {
    const matchesProject =
      secret.projectId !== null && includedProjectIds.has(secret.projectId);
    const matchesInclude = includedKeys.has(secret.key);

    if (!matchesProject && !matchesInclude) {
      continue;
    }

    if (excludedKeys.has(secret.key)) {
      continue;
    }

    selected.push(secret);
  }

  return selected;
}

export function filterSecretsForTarget(
  secrets: ResolvedSecret[],
  targetConfig: BitwardenTargetConfig,
  organizationId: string,
  target: string,
): ResolvedSecret[] {
  const selected = getCandidateSecretsForTarget(secrets, targetConfig);
  const seenKeys = new Set<string>();

  for (const secret of selected) {

    if (secret.organizationId !== organizationId) {
      throw new Error(
        `Bitwarden secret ${secret.key} for target ${target} belongs to ${secret.organizationId}, expected ${organizationId}`,
      );
    }

    if (!envNamePattern.test(secret.key)) {
      throw new Error(
        `Bitwarden secret key ${secret.key} for target ${target} is not a valid env var name`,
      );
    }

    if (seenKeys.has(secret.key)) {
      throw new Error(
        `Duplicate Bitwarden env key ${secret.key} detected for target ${target}`,
      );
    }

    seenKeys.add(secret.key);
  }

  if (selected.length === 0) {
    throw new Error(
      `No Bitwarden secrets matched target ${target}. Check target projectIds/includeKeys and secret assignments.`,
    );
  }

  return selected.sort((left, right) => left.key.localeCompare(right.key));
}

export function buildInjectedEnvironment(
  secrets: ResolvedSecret[],
  baseEnv: NodeJS.ProcessEnv = process.env,
): InjectedEnvironmentResult {
  const env = Object.fromEntries(
    Object.entries(baseEnv).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  for (const secret of secrets) {
    env[secret.key] = secret.value;
  }

  return {
    env,
    hash: hashSecrets(secrets),
    keys: secrets.map((secret) => secret.key),
  };
}

export function hashSecrets(secrets: ResolvedSecret[]): string {
  const digest = createHash("sha256");

  for (const secret of [...secrets].sort((left, right) => left.key.localeCompare(right.key))) {
    digest.update(`${secret.key}=${secret.value}\n`);
  }

  return digest.digest("hex");
}
