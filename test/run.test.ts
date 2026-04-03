import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { promisify } from "node:util";

import { runCli } from "../src/cli";
import { loadSecretsForTarget, runWithSecrets } from "../src/run";
import {
  __setSdkModuleLoaderForTests,
  __setSecretsSyncClientFactoryForTests,
} from "../src/sdk";
import { createWorkspaceFixture, makeSecret } from "./fixtures";

const originalCwd = process.cwd();
const execFileAsync = promisify(execFile);

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.BITWARDEN_SM_ACCESS_TOKEN;
  delete process.env.BITWARDEN_SM_ORGANIZATION_ID;
  delete process.env.BITWARDEN_SM_API_URL;
  delete process.env.BITWARDEN_SM_IDENTITY_URL;
  __setSdkModuleLoaderForTests(null);
  __setSecretsSyncClientFactoryForTests(null);
});

describe("Bitwarden run helpers", () => {
  test("loads secrets for a target using the configured project allowlist", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "NEXT_PUBLIC_API_URL",
            projectId: "00000000-0000-0000-0000-000000000001",
            value: "https://example.com",
          }),
          makeSecret({
            id: "secret-2",
            key: "IGNORED_SECRET",
            projectId: "00000000-0000-0000-0000-000000000123",
            value: "nope",
          }),
        ];
      },
    }));

    const result = await loadSecretsForTarget("web");

    assert.deepEqual(result.keys, ["NEXT_PUBLIC_API_URL"]);
    assert.equal(result.env.NEXT_PUBLIC_API_URL, "https://example.com");
  });

  test("does not mutate caller process.env while loading root env files", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    await writeFile(
      join(workspaceRoot, ".env"),
      "BITWARDEN_SM_ACCESS_TOKEN=from-dotenv\nBITWARDEN_SM_ORGANIZATION_ID=00000000-0000-0000-0000-000000000999\n",
    );

    delete process.env.BITWARDEN_SM_ACCESS_TOKEN;
    delete process.env.BITWARDEN_SM_ORGANIZATION_ID;

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "NEXT_PUBLIC_API_URL",
            projectId: "00000000-0000-0000-0000-000000000001",
            value: "https://example.com",
          }),
        ];
      },
    }));

    await loadSecretsForTarget("web");

    assert.equal(process.env.BITWARDEN_SM_ACCESS_TOKEN, undefined);
    assert.equal(process.env.BITWARDEN_SM_ORGANIZATION_ID, undefined);
  });

  test("propagates child exit codes while injecting env", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "NEXT_PUBLIC_API_URL",
            projectId: "00000000-0000-0000-0000-000000000001",
            value: "https://example.com",
          }),
        ];
      },
    }));

    const successCode = await runWithSecrets("web", [
      process.execPath,
      "-e",
      "if (process.env.NEXT_PUBLIC_API_URL !== 'https://example.com') process.exit(9); if (process.env.BWSM_TARGET !== 'web') process.exit(8); if (!process.env.BWSM_ENV_HASH) process.exit(6);",
    ]);
    const failureCode = await runWithSecrets("web", [
      process.execPath,
      "-e",
      "process.exit(7)",
    ]);

    assert.equal(successCode, 0);
    assert.equal(failureCode, 7);
  });

  test("returns non-zero for unknown targets", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "unknown",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /Unknown Bitwarden target unknown/);
  });

  test("returns non-zero when bootstrap env is missing", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(
      errors.join("\n"),
      /Missing required Bitwarden bootstrap env var BITWARDEN_SM_ACCESS_TOKEN/,
    );
  });

  test("returns non-zero when the SDK adapter throws", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        throw new Error("synthetic auth failure");
      },
    }));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /synthetic auth failure/);
  });

  test("returns non-zero for duplicate keys at CLI runtime", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "WEB_SECRET",
            value: "one",
          }),
          makeSecret({
            id: "secret-2",
            key: "WEB_SECRET",
            value: "two",
          }),
        ];
      },
    }));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /Duplicate Bitwarden env key WEB_SECRET/);
  });

  test("returns non-zero for invalid env key names at CLI runtime", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "not.valid",
            value: "one",
          }),
        ];
      },
    }));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /is not a valid env var name/);
  });

  test("returns non-zero for organization mismatch at CLI runtime", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "WEB_SECRET",
            organizationId: "00000000-0000-0000-0000-000000000123",
          }),
        ];
      },
    }));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /belongs to 00000000-0000-0000-0000-000000000123/);
  });

  test("returns non-zero for zero matched secrets with actionable output", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "DOCS_SECRET",
            projectId: "00000000-0000-0000-0000-000000000002",
          }),
        ];
      },
    }));

    const { errors, exitCode } = await runCliCaptured([
      "run",
      "--target",
      "web",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    assert.equal(exitCode, 1);
    assert.match(
      errors.join("\n"),
      /No Bitwarden secrets matched target web\. Check target projectIds\/includeKeys and secret assignments\./,
    );
  });

  test("finds JavaScript config fallbacks", async () => {
    const workspaceRoot = await createWorkspaceFixture({
      configFileName: "bitwarden.config.cjs",
    });

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        return [
          makeSecret({
            key: "NEXT_PUBLIC_API_URL",
            projectId: "00000000-0000-0000-0000-000000000001",
            value: "https://example.com",
          }),
        ];
      },
    }));

    const result = await loadSecretsForTarget("web");

    assert.equal(result.env.NEXT_PUBLIC_API_URL, "https://example.com");
  });

  test("persistState false uses an ephemeral state directory and cleans up", async () => {
    const workspaceRoot = await createWorkspaceFixture();
    let capturedStateFilePath = "";

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";
    __setSecretsSyncClientFactoryForTests(null);
    __setSdkModuleLoaderForTests(async () => ({
      BitwardenClient: class {
        auth() {
          return {
            loginAccessToken: async (_token: string, stateFilePath: string) => {
              capturedStateFilePath = stateFilePath;
              await writeFile(stateFilePath, "tmp-state");
            },
          };
        }
        secrets() {
          return {
            sync: async () => ({
              secrets: [
                makeSecret({
                  key: "NEXT_PUBLIC_API_URL",
                  value: "https://example.com",
                }),
              ],
            }),
          };
        }
      },
      DeviceType: {
        SDK: "SDK",
      },
    }) as unknown as typeof import("@bitwarden/sdk-napi"));

    await loadSecretsForTarget("web", { persistState: false });

    assert.notEqual(capturedStateFilePath, "");
    assert.match(capturedStateFilePath, new RegExp(tmpdir()));
    await assert.rejects(access(capturedStateFilePath), /ENOENT/);
  });

  test("built CLI keeps a node shebang and runs under Node", async () => {
    const workspaceRoot = await createWorkspaceFixture();
    const distCliPath = join(process.cwd(), "dist", "cli.js");

    await access(distCliPath, fsConstants.F_OK);
    const cliContent = await readFile(distCliPath, "utf8");
    assert.match(cliContent, /^#!\/usr\/bin\/env node/);

    const error = await execFileAsync(
      process.execPath,
      [
        distCliPath,
        "run",
        "--target",
        "missing",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      {
        cwd: workspaceRoot,
      },
    ).then(
      () => null,
      (caught: Error & { code?: number; stderr?: string }) => caught,
    );

    assert.ok(error);
    assert.equal(error.code, 1);
    assert.match(error.stderr ?? "", /Unknown Bitwarden target missing/);
  });

  test("built CLI runs under Bun when Bun is available", async () => {
    try {
      await execFileAsync("bun", ["--version"]);
    } catch {
      return;
    }

    const workspaceRoot = await createWorkspaceFixture();
    const distCliPath = join(process.cwd(), "dist", "cli.js");

    const error = await execFileAsync(
      "bun",
      [
        distCliPath,
        "run",
        "--target",
        "missing",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      {
        cwd: workspaceRoot,
      },
    ).then(
      () => null,
      (caught: Error & { code?: number; stderr?: string }) => caught,
    );

    assert.ok(error);
    assert.equal(error.code, 1);
    assert.match(error.stderr ?? "", /Unknown Bitwarden target missing/);
  });
});

async function runCliCaptured(argv: string[]): Promise<{
  exitCode: number;
  errors: string[];
}> {
  const originalError = console.error;
  const errors: string[] = [];

  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const exitCode = await runCli(argv);
    return { errors, exitCode };
  } finally {
    console.error = originalError;
  }
}
