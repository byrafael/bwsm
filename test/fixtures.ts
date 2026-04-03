import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ResolvedSecret } from "../src/types";

interface CreateWorkspaceFixtureOptions {
  configContents?: string;
  configFileName?: string;
}

export async function createWorkspaceFixture(
  options: CreateWorkspaceFixtureOptions = {},
): Promise<string> {
  const configFileName = options.configFileName ?? "bitwarden.config.ts";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "bwsm-fixture-"));

  await mkdir(join(workspaceRoot, "apps", "web"), { recursive: true });
  await mkdir(join(workspaceRoot, "apps", "docs"), { recursive: true });
  await mkdir(join(workspaceRoot, "apps", "bot"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(workspaceRoot, configFileName),
    options.configContents ?? getConfigContents(configFileName),
  );

  return workspaceRoot;
}

export function getConfigContents(configFileName: string): string {
  if (configFileName.endsWith(".cjs")) {
    return `module.exports = {
  bootstrap: {
    accessTokenEnv: "BITWARDEN_SM_ACCESS_TOKEN",
    organizationIdEnv: "BITWARDEN_SM_ORGANIZATION_ID",
    apiUrlEnv: "BITWARDEN_SM_API_URL",
    identityUrlEnv: "BITWARDEN_SM_IDENTITY_URL"
  },
  targets: {
    web: {
      projectIds: ["00000000-0000-0000-0000-000000000001"],
      includeKeys: [],
      excludeKeys: []
    },
    docs: {
      projectIds: ["00000000-0000-0000-0000-000000000002"],
      includeKeys: [],
      excludeKeys: []
    },
    bot: {
      projectIds: ["00000000-0000-0000-0000-000000000003"],
      includeKeys: [],
      excludeKeys: []
    }
  }
};\n`;
  }

  if (configFileName.endsWith(".mjs") || configFileName.endsWith(".js")) {
    return `export default {
  bootstrap: {
    accessTokenEnv: "BITWARDEN_SM_ACCESS_TOKEN",
    organizationIdEnv: "BITWARDEN_SM_ORGANIZATION_ID",
    apiUrlEnv: "BITWARDEN_SM_API_URL",
    identityUrlEnv: "BITWARDEN_SM_IDENTITY_URL"
  },
  targets: {
    web: {
      projectIds: ["00000000-0000-0000-0000-000000000001"],
      includeKeys: [],
      excludeKeys: []
    },
    docs: {
      projectIds: ["00000000-0000-0000-0000-000000000002"],
      includeKeys: [],
      excludeKeys: []
    },
    bot: {
      projectIds: ["00000000-0000-0000-0000-000000000003"],
      includeKeys: [],
      excludeKeys: []
    }
  }
};\n`;
  }

  return `export default {
  bootstrap: {
    accessTokenEnv: "BITWARDEN_SM_ACCESS_TOKEN",
    organizationIdEnv: "BITWARDEN_SM_ORGANIZATION_ID",
    apiUrlEnv: "BITWARDEN_SM_API_URL",
    identityUrlEnv: "BITWARDEN_SM_IDENTITY_URL"
  },
  targets: {
    web: {
      projectIds: ["00000000-0000-0000-0000-000000000001"],
      includeKeys: [],
      excludeKeys: []
    },
    docs: {
      projectIds: ["00000000-0000-0000-0000-000000000002"],
      includeKeys: [],
      excludeKeys: []
    },
    bot: {
      projectIds: ["00000000-0000-0000-0000-000000000003"],
      includeKeys: [],
      excludeKeys: []
    }
  }
} as const;\n`;
}

export function makeSecret(overrides: Partial<ResolvedSecret>): ResolvedSecret {
  return {
    creationDate: new Date("2024-01-01T00:00:00.000Z"),
    id: "secret-1",
    key: "TEST_SECRET",
    note: "",
    organizationId: "00000000-0000-0000-0000-000000000999",
    projectId: "00000000-0000-0000-0000-000000000001",
    revisionDate: new Date("2024-01-02T00:00:00.000Z"),
    value: "secret-value",
    ...overrides,
  };
}
