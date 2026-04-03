import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { join } from "node:path";

import { runCli } from "../src/cli";
import { __setSecretsSyncClientFactoryForTests } from "../src/sdk";
import { createWorkspaceFixture, makeSecret } from "./fixtures";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.BITWARDEN_SM_ACCESS_TOKEN;
  delete process.env.BITWARDEN_SM_ORGANIZATION_ID;
  delete process.env.BITWARDEN_SM_API_URL;
  delete process.env.BITWARDEN_SM_IDENTITY_URL;
  __setSecretsSyncClientFactoryForTests(null);
});

describe("doctor command", () => {
  test("reports all stages on success", async () => {
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
            value: "never-print-me",
          }),
        ];
      },
    }));

    const { exitCode, logs } = await runCliCaptured(["doctor", "--target", "web"]);

    assert.equal(exitCode, 0);
    assert.ok(logs.some((line) => line.includes("[ok] workspace discovery:")));
    assert.ok(logs.some((line) => line.includes("[ok] config discovery/load:")));
    assert.ok(logs.some((line) => line.includes("[ok] target existence:")));
    assert.ok(logs.some((line) => line.includes("[ok] bootstrap env presence:")));
    assert.ok(logs.some((line) => line.includes("[ok] state resolution:")));
    assert.ok(logs.some((line) => line.includes("[ok] SDK login/sync access:")));
    assert.ok(logs.some((line) => line.includes("[ok] organization match:")));
    assert.ok(logs.some((line) => line.includes("[ok] matched secret selection:")));
    assert.equal(logs.join("\n").includes("never-print-me"), false);
  });

  test("fails target existence stage for unknown target", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";

    const { exitCode, logs } = await runCliCaptured([
      "doctor",
      "--target",
      "missing",
    ]);

    assert.equal(exitCode, 1);
    assert.ok(logs.some((line) => line.includes("[fail] target existence:")));
  });

  test("fails bootstrap env stage when required env vars are missing", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));

    const { exitCode, logs } = await runCliCaptured(["doctor", "--target", "web"]);

    assert.equal(exitCode, 1);
    assert.ok(logs.some((line) => line.includes("[fail] bootstrap env presence:")));
  });

  test("fails sdk login/sync stage when sync throws", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    process.chdir(join(workspaceRoot, "apps", "web"));
    process.env.BITWARDEN_SM_ACCESS_TOKEN = "test-token";
    process.env.BITWARDEN_SM_ORGANIZATION_ID =
      "00000000-0000-0000-0000-000000000999";
    __setSecretsSyncClientFactoryForTests(() => ({
      async syncSecrets() {
        throw new Error("synthetic sdk failure");
      },
    }));

    const { exitCode, logs } = await runCliCaptured(["doctor", "--target", "web"]);

    assert.equal(exitCode, 1);
    assert.ok(logs.some((line) => line.includes("[fail] SDK login/sync access:")));
  });

  test("fails organization match stage when candidate secrets use another org", async () => {
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
            organizationId: "00000000-0000-0000-0000-000000000123",
          }),
        ];
      },
    }));

    const { exitCode, logs } = await runCliCaptured(["doctor", "--target", "web"]);

    assert.equal(exitCode, 1);
    assert.ok(logs.some((line) => line.includes("[fail] organization match:")));
  });

  test("fails matched secret selection stage when no secrets match target filters", async () => {
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

    const { exitCode, logs } = await runCliCaptured(["doctor", "--target", "web"]);

    assert.equal(exitCode, 1);
    assert.ok(logs.some((line) => line.includes("[fail] matched secret selection:")));
  });
});

async function runCliCaptured(argv: string[]): Promise<{
  exitCode: number;
  logs: string[];
}> {
  const originalLog = console.log;
  const originalError = console.error;
  const logs: string[] = [];

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const exitCode = await runCli(argv);
    return { exitCode, logs };
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
}
