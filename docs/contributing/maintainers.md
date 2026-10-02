# Maintainers

| Maintainer | GitHub |
| --- | --- |
| Project lead | [@RaioViajante](https://github.com/RaioViajante) |

## Open items

- [ ] **Migrate code ownership to a team.** `.github/CODEOWNERS` lists `@RaioViajante`
  directly because the `@mochifile/maintainers` team does not exist yet. Once the GitHub
  organization has the team, replace the owner with `@mochifile/maintainers`.
- [ ] Create the `conduct@mochifile.com` and `security@mochifile.com` mailboxes referenced by
  `CODE_OF_CONDUCT.md` and `SECURITY.md`.
- [ ] Enable branch protection on `main` (require PRs, passing CI and CodeQL, linear history).
- [ ] Install the Renovate GitHub app.
- [ ] **Remove the `minimumReleaseAgeExclude` entries from `pnpm-workspace.yaml`** once the
  versions are older than pnpm's release-age threshold (pnpm 12 default: `minimumReleaseAge`
  1440 minutes = 1 day). pnpm added them automatically because these versions were brand new
  when they were installed during bootstrap:
  `turbo@2.11.7` and its six `@turbo/*@2.11.7` platform binaries (published 2026-10-02 14:58 UTC),
  `@types/node@24.19.1` (published 2026-10-01 22:38 UTC). They can go after
  **2026-10-03 15:00 UTC**. Delete the whole `minimumReleaseAgeExclude` key, then run
  `pnpm install` and confirm the lockfile does not change. Do not add new exclusions without
  a reason in the PR.
