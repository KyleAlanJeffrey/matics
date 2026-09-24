# Versioning

Semantic Versioning 2.0.0. The current version is in `VERSION` and mirrored in
`package.json`.

- Pre-1.0: minor bumps may include breaking changes to the stored project format.
- From 1.0: a breaking change to the stored project format is a major bump and must ship
  with a migration in the store's `load()`.

Bump the version in a dedicated `chore(release): x.y.z` commit.

## Releasing

1. In the `chore(release): x.y.z` commit, set the version in `VERSION`, `package.json`,
   `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (the installers take theirs from
   `tauri.conf.json`).
2. After it merges, tag main: `git tag vx.y.z && git push origin vx.y.z`.
3. The Release workflow checks the tag against `VERSION`, builds the macOS (universal),
   Windows and Linux installers, and attaches them to a draft GitHub release.
4. Review the draft on the Releases page and publish it.

Running the Release workflow by hand (Actions > Release > Run workflow) builds the same
installers as downloadable workflow artifacts without creating a release.
