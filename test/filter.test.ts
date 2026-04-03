import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildInjectedEnvironment,
  filterSecretsForTarget,
  hashSecrets,
} from "../src/filter";
import type { BitwardenTargetConfig, ResolvedSecret } from "../src/types";

const baseTargetConfig: BitwardenTargetConfig = {
  excludeKeys: [],
  includeKeys: [],
  projectIds: ["00000000-0000-0000-0000-000000000111"],
};

const baseSecret: ResolvedSecret = {
  creationDate: new Date("2024-01-01T00:00:00.000Z"),
  id: "secret-1",
  key: "FLAGIFY_READ_KEY",
  note: "",
  organizationId: "00000000-0000-0000-0000-000000000999",
  projectId: "00000000-0000-0000-0000-000000000111",
  revisionDate: new Date("2024-01-02T00:00:00.000Z"),
  value: "value-1",
};

describe("filterSecretsForTarget", () => {
  test("includes secrets that match configured project IDs", () => {
    const secrets = filterSecretsForTarget(
      [baseSecret],
      baseTargetConfig,
      baseSecret.organizationId,
      "bot",
    );

    assert.deepEqual(secrets, [baseSecret]);
  });

  test("admits project-less secrets through includeKeys", () => {
    const secrets = filterSecretsForTarget(
      [
        {
          ...baseSecret,
          key: "DISCORD_TOKEN",
          projectId: null,
        },
      ],
      {
        ...baseTargetConfig,
        includeKeys: ["DISCORD_TOKEN"],
      },
      baseSecret.organizationId,
      "bot",
    );

    assert.equal(secrets[0]?.key, "DISCORD_TOKEN");
  });

  test("removes excluded secrets even when they match projects", () => {
    assert.throws(
      () =>
        filterSecretsForTarget(
          [baseSecret],
          {
            ...baseTargetConfig,
            excludeKeys: ["FLAGIFY_READ_KEY"],
          },
          baseSecret.organizationId,
          "bot",
        ),
      /No Bitwarden secrets matched/,
    );
  });

  test("fails on duplicate env keys", () => {
    assert.throws(
      () =>
        filterSecretsForTarget(
          [
            baseSecret,
            {
              ...baseSecret,
              id: "secret-2",
              value: "value-2",
            },
          ],
          baseTargetConfig,
          baseSecret.organizationId,
          "bot",
        ),
      /Duplicate Bitwarden env key FLAGIFY_READ_KEY/,
    );
  });

  test("fails on invalid env names", () => {
    assert.throws(
      () =>
        filterSecretsForTarget(
          [
            {
              ...baseSecret,
              key: "flagify.read.key",
            },
          ],
          baseTargetConfig,
          baseSecret.organizationId,
          "bot",
        ),
      /is not a valid env var name/,
    );
  });

  test("fails when included secrets belong to another organization", () => {
    assert.throws(
      () =>
        filterSecretsForTarget(
          [
            {
              ...baseSecret,
              key: "WEBHOOK_SECRET",
              organizationId: "00000000-0000-0000-0000-000000000123",
              projectId: null,
            },
          ],
          {
            ...baseTargetConfig,
            includeKeys: ["WEBHOOK_SECRET"],
          },
          baseSecret.organizationId,
          "bot",
        ),
      /belongs to 00000000-0000-0000-0000-000000000123/,
    );
  });
});

describe("hashSecrets", () => {
  test("is stable for the same sorted secret set", () => {
    const hash = hashSecrets([
      {
        ...baseSecret,
        key: "Z_SECRET",
        value: "z-value",
      },
      {
        ...baseSecret,
        id: "secret-3",
        key: "A_SECRET",
        value: "a-value",
      },
    ]);

    assert.equal(
      hash,
      hashSecrets([
        {
          ...baseSecret,
          id: "secret-3",
          key: "A_SECRET",
          value: "a-value",
        },
        {
          ...baseSecret,
          key: "Z_SECRET",
          value: "z-value",
        },
      ]),
    );
  });

  test("builds a merged environment overlay", () => {
    const result = buildInjectedEnvironment(
      [
        {
          ...baseSecret,
          key: "WEB_SECRET",
          value: "from-bitwarden",
        },
      ],
      {
        EXISTING: "yes",
        WEB_SECRET: "old",
      },
    );

    assert.deepEqual(result.env, {
      EXISTING: "yes",
      WEB_SECRET: "from-bitwarden",
    });
    assert.deepEqual(result.keys, ["WEB_SECRET"]);
  });
});
