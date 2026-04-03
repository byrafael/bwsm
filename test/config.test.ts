import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";

import { loadBitwardenConfig } from "../src/config";
import { createWorkspaceFixture } from "./fixtures";

describe("bitwarden config validation", () => {
  test("fails for invalid config shape", async () => {
    const workspaceRoot = await createWorkspaceFixture({
      configContents: `export default "invalid";\n`,
    });

    await assert.rejects(
      loadBitwardenConfig(workspaceRoot),
      /Expected object, received string/,
    );
  });

  test("fails for invalid target definitions", async () => {
    const workspaceRoot = await createWorkspaceFixture();

    await writeFile(
      join(workspaceRoot, "bitwarden.config.ts"),
      `export default {
  targets: {
    web: {
      projectIds: [],
      includeKeys: [],
      excludeKeys: []
    }
  }
} as const;\n`,
    );

    await assert.rejects(
      loadBitwardenConfig(workspaceRoot),
      /at least one project ID/,
    );
  });
});
