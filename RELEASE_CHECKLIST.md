# Release Checklist

- [ ] `bun run build` passes
- [ ] `bun run test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run sizecheck` passes
- [ ] Built CLI verified under Node (`node dist/cli.js ...`)
- [ ] Built CLI verified under Bun (`bun dist/cli.js ...`)
- [ ] README and examples reflect current CLI/API behavior
- [ ] `.env.example` is up to date
- [ ] `package.json` metadata checked (name/version/exports/bin/files)
- [ ] Changelog or release notes prepared and reviewed
