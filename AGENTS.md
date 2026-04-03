## Task Completion Requirements

Before marking any tasks as complete, ensure that:

1. Any and all CI scripts, including `bun typecheck`, `bun run build`, and `bun sizecheck` pass.
2. The task, and its implementation, does not compromise the long-term maintainability of the project.
3. Any shared or duplicate logic is transferred to a separate module and file.
4. The task puts security first.

## Git Branching Rules

All branches must follow a strict naming scheme so that tooling (GitHub Actions, CodeRabbit, Linear integrations) can parse them reliably.

### Branch Name Format

```text
<type>/<short-title>
```

| Part            | Description                                | Example             |
| --------------- | ------------------------------------------ | ------------------- |
| `<type>`        | Category of work (see below)               | `feat`              |
| `<short-title>` | Hyphenated lowercase summary (max 5 words) | `git-workflow-docs` |

### Branch Types

| Type        | When to Use                                     |
| ----------- | ----------------------------------------------- |
| `feat/`     | New feature or enhancement                      |
| `fix/`      | Bug fix (non-critical, normal workflow)         |
| `hotfix/`   | Critical production fix — branches from `main`  |
| `chore/`    | Maintenance, dependency updates, config changes |
| `refactor/` | Code restructuring with no behaviour change     |
| `docs/`     | Documentation-only changes                      |
| `test/`     | Adding or fixing tests only                     |
| `ci/`       | CI/CD pipeline changes                          |
| `release/`  | Release preparation branches (CI/CD team only)  |

### Branch Naming Rules

1. Always lowercase — no uppercase letters anywhere.
2. Hyphens only — no underscores, no dots, no slashes except the `<type>/` prefix.
3. Max 60 characters total — keep the `<short-title>` concise.
4. No consecutive hyphens — `fix--thing` is invalid.
5. No trailing hyphen — `feat/add-no-state-flag` is invalid.

## Commit Message Rules

All commit messages must follow Conventional Commits format:

```text
<type>(<scope>): <short description>
```

- `type` must match one of: `feat`, `fix`, `hotfix`, `chore`, `refactor`, `docs`, `test`, `ci`.
- `scope` is the module or area of change (e.g., `payments`, `pricing`, `auth`).
- Description must be lowercase, imperative mood, max 72 characters.

### Commit Best Practices

- Each commit should be atomic — one logical change per commit.
- Do NOT commit unrelated changes together.
- Add only the relevant files — never use `git add .` or `git add -A` blindly.
- Run tests locally before pushing.

### AI Authorship — Strictly Prohibited

Never add any AI model, agent, or tool (Claude, Cursor, GitHub Copilot, or any other) as a co-author, contributor, or signatory on any commit. This applies to `Co-Authored-By`, `Signed-off-by`, and any other git trailer. Every commit must be traceable to a human developer.
