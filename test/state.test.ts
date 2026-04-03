import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";

import { logoutTargetState } from "../src/run";
import { resolveRuntimeState } from "../src/state";
import { createWorkspaceFixture } from "./fixtures";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe("state handling", () => {
  test("resolves deterministic state paths with runtime overrides", async () => {
    const workspaceRoot = await createWorkspaceFixture({
      configContents: `export default {
  runtime: {
    stateDir: ".custom/state",
    persistState: false
  },
  targets: {
    web: {
      projectIds: ["00000000-0000-0000-0000-000000000001"],
      includeKeys: [],
      excludeKeys: []
    }
  }
} as const;\n`,
    });

    const fromConfig = resolveRuntimeState(
      workspaceRoot,
      "apps/web",
      {
        stateDir: ".custom/state",
        persistState: false,
      },
      {},
    );
    const fromOptions = resolveRuntimeState(
      workspaceRoot,
      "apps/web",
      undefined,
      {
        persistState: true,
        stateDir: "tmp-state",
      },
    );

    assert.equal(fromConfig.persistState, false);
    assert.equal(fromConfig.persistStateSource, "config");
    assert.equal(
      fromConfig.stateDir,
      join(workspaceRoot, ".custom", "state"),
    );
    assert.equal(fromConfig.stateFile, join(fromConfig.stateDir, "apps_web.json"));
    assert.equal(fromOptions.persistState, true);
    assert.equal(fromOptions.persistStateSource, "option");
    assert.equal(fromOptions.stateDir, join(workspaceRoot, "tmp-state"));
    assert.equal(fromOptions.stateFile, join(fromOptions.stateDir, "apps_web.json"));
  });

  test("logout removes persisted state and is idempotent", async () => {
    const workspaceRoot = await createWorkspaceFixture();
    const stateDir = join(workspaceRoot, ".cache", "bitwarden-sm", "state");
    const stateFile = join(stateDir, "web.json");

    process.chdir(join(workspaceRoot, "apps", "web"));
    await mkdir(stateDir, { recursive: true });
    await writeFile(stateFile, "state");

    const first = await logoutTargetState("web");
    const second = await logoutTargetState("web");

    assert.equal(first.removed, true);
    assert.equal(first.pruned, true);
    await assert.rejects(access(stateFile), /ENOENT/);
    assert.equal(second.removed, false);
  });
});
