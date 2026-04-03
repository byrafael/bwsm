# bwsm

`bwsm` is a Bitwarden Secrets Manager helper for monorepos.

> [!IMPORTANT]
> `bwsm` is in very early development, and is not designed for enterprise usage.<br/>
> This means that bugs are to be expected. Report any bugs via [GitHub Issues](https://github.com/byrafael/bwsm/issues).
>
> Contributions are welcomed and encouraged. Just use Bun :)

## Installation

**Bun Package Manager:**
```sh
bun install --dev bwsm
```

**NPM:**
```sh
npm install -D bwsm
```

## Usage

**1. Create a `bitwarden.config.ts` at your repository root.**<br/>
Define one target per app/process that should receive injected secrets.
```ts
export default {
  bootstrap: {
    // These map to existing env var names in your shell/.env files.
    accessTokenEnv: "BITWARDEN_SM_ACCESS_TOKEN",
    organizationIdEnv: "BITWARDEN_SM_ORGANIZATION_ID",
    apiUrlEnv: "BITWARDEN_SM_API_URL",
    identityUrlEnv: "BITWARDEN_SM_IDENTITY_URL",
  },
  runtime: {
    // Optional. Defaults shown.
    stateDir: ".cache/bitwarden-sm/state",
    persistState: true,
  },
  targets: {
    "@project/app1": {
      // Include at least one Bitwarden project ID.
      projectIds: ["00000000-0000-0000-0000-000000000001"],
      // Optional explicit key allowlist (in addition to project matches).
      includeKeys: [],
      // Optional denylist (always removed).
      excludeKeys: [],
    },
    "@project/app2": {
      projectIds: ["00000000-0000-0000-0000-000000000002"],
      includeKeys: [],
      excludeKeys: [],
    },
  },
} as const;
```

**2. Provide bootstrap env vars.**<br/>
Set these in your shell, `.env`, or `.env.local`:

```sh
BITWARDEN_SM_ACCESS_TOKEN=
BITWARDEN_SM_ORGANIZATION_ID=
BITWARDEN_SM_API_URL=https://api.bitwarden.com
BITWARDEN_SM_IDENTITY_URL=https://identity.bitwarden.com
```

Precedence is: explicit process env > `.env.local` > `.env`.

**3. Run commands with `bwsm`.**<br/>
Use `bwsm run` to inject secrets into a child process environment and execute your command. Add those inside each app's package.json scripts.

```sh
# General form
bwsm run --target <target> -- <command> [args...]

# Node app
bwsm run --target @project/app1 -- node apps/app1/server.js

# Bun app
bwsm run --target @project/app1 -- bun run --cwd apps/app1 dev

# Package script
bwsm run --target @project/app1 -- npm run -w @project/app1 dev
```

`bwsm run` injects matched secrets plus:

- `BWSM_ENV_HASH`
- `BWSM_TARGET`

Optional runtime flags:

```sh
bwsm run --target @project/app1 --state-dir .cache/custom-bwsm --persist-state -- node app.js
bwsm run --target @project/app1 --no-persist-state -- node app.js
```

**4. Diagnose target setup with `doctor`.**<br/>
`doctor` validates one target end-to-end and reports stage-by-stage status:

```sh
bwsm doctor --target @project/app1
bwsm doctor --target @project/app1 --state-dir .cache/custom-bwsm --no-persist-state
```

What `doctor` does:

1. Checks workspace/config discovery.
2. Confirms target exists.
3. Validates required bootstrap env vars.
4. Resolves runtime state path/options.
5. Attempts SDK login/sync.
6. Validates org match and secret selection.

`doctor` prints key names/counts and resolved paths, but never secret values.

**5. Clear local SDK state with `logout`.**<br/>
`logout` is local cache cleanup for a target state file:

```sh
bwsm logout --target @project/app1
bwsm logout --target @project/app1 --state-dir .cache/custom-bwsm
```

What `logout` does:

1. Resolves the target-specific state file path.
2. Deletes that file if it exists.
3. Prunes the state directory if empty.
4. Succeeds even if the file did not exist.

`logout` does not revoke tokens in Bitwarden; it only removes local persisted state.
