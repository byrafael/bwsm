import assert from "node:assert/strict";
import { realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";

import {
  findWorkspaceRoot,
  loadRootEnvironmentFiles,
  mergeBootstrapEnv,
  resolveBootstrapEnvironment,
} from "../src/bootstrap-env";
import { loadBitwardenConfig } from "../src/config";
import { getStateFilePath } from "../src/sdk";
import { createWorkspaceFixture } from "./fixtures";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.BITWARDEN_SM_ACCESS_TOKEN;
  delete process.env.BITWARDEN_SM_ORGANIZATION_ID;
  delete process.env.BITWARDEN_SM_API_URL;
  delete process.env.BITWARDEN_SM_IDENTITY_URL;
});

describe("bootstrap env helpers", () => {
  test("loads a TypeScript config and honors .env.local over .env", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    await writeFile(
      join(workspaceRoot, ".env"),
      "BITWARDEN_SM_ACCESS_TOKEN=from-dotenv\nBITWARDEN_SM_ORGANIZATION_ID=00000000-0000-0000-0000-000000000999\n",
    );
    await writeFile(
      join(workspaceRoot, ".env.local"),
      "BITWARDEN_SM_ACCESS_TOKEN=from-dotenv-local\n",
    );

    process.chdir(join(workspaceRoot, "apps", "web"));

    const rootEnv = await loadRootEnvironmentFiles(await findWorkspaceRoot());
    const mergedEnv = mergeBootstrapEnv({}, rootEnv);
    const config = await loadBitwardenConfig(workspaceRoot);
    const bootstrap = resolveBootstrapEnvironment(
      config.bootstrap,
      mergedEnv,
      workspaceRoot,
    );

    assert.equal(bootstrap.accessToken, "from-dotenv-local");
    assert.equal(
      bootstrap.organizationId,
      "00000000-0000-0000-0000-000000000999",
    );
    assert.equal(bootstrap.apiUrl, "https://api.bitwarden.com");
    assert.deepEqual(Object.keys(config.targets), ["web", "docs", "bot"]);
  });

  test("prefers explicit env values over .env.local and .env", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    await writeFile(
      join(workspaceRoot, ".env"),
      "BITWARDEN_SM_ACCESS_TOKEN=from-dotenv\nBITWARDEN_SM_ORGANIZATION_ID=00000000-0000-0000-0000-000000000999\n",
    );
    await writeFile(
      join(workspaceRoot, ".env.local"),
      "BITWARDEN_SM_ACCESS_TOKEN=from-dotenv-local\n",
    );

    const rootEnv = await loadRootEnvironmentFiles(workspaceRoot);
    const mergedEnv = mergeBootstrapEnv(
      {
        BITWARDEN_SM_ACCESS_TOKEN: "from-explicit-env",
      },
      rootEnv,
    );
    const config = await loadBitwardenConfig(workspaceRoot);
    const bootstrap = resolveBootstrapEnvironment(
      config.bootstrap,
      mergedEnv,
      workspaceRoot,
    );

    assert.equal(bootstrap.accessToken, "from-explicit-env");
  });

  test("finds the config root from a nested app directory without turborepo metadata", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "docs"));

    assert.equal(await findWorkspaceRoot(), await realpath(workspaceRoot));
  });

  test("builds a deterministic state-file path per target", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    assert.equal(
      getStateFilePath(workspaceRoot, "web"),
      join(workspaceRoot, ".cache", "bitwarden-sm", "state", "web.json"),
    );
    assert.equal(
      getStateFilePath(workspaceRoot, "apps/web"),
      join(workspaceRoot, ".cache", "bitwarden-sm", "state", "apps_web.json"),
    );
  });

  test("falls back to JavaScript config files", async () => {
    const workspaceRoot = await createWorkspaceFixture({
      configFileName: "bitwarden.config.mjs",
    });

    process.chdir(join(workspaceRoot, "apps", "web"));

    const config = await loadBitwardenConfig(workspaceRoot);

    assert.deepEqual(Object.keys(config.targets), ["web", "docs", "bot"]);
  });
});
