# Versioning

Semantic Versioning 2.0.0. The current version is in `VERSION` and mirrored in
`package.json`.

- Pre-1.0: minor bumps may include breaking changes to the stored project format.
- From 1.0: a breaking change to the stored project format is a major bump and must ship
  with a migration in the store's `load()`.

Bump the version in a dedicated `chore(release): x.y.z` commit.

## Releasing

Every push to main (a merged PR or a direct push) runs the Release workflow. It builds the
macOS (universal), Windows and Linux installers and publishes them as a GitHub release
tagged `v<VERSION>-build.<run number>`, for example `v0.1.0-build.7`. The newest build is
the latest release, which the README's Download link points to. If any platform fails to
build, the release stays a draft.

To change the version, set it in `VERSION`, `package.json`, `src-tauri/tauri.conf.json`
and `src-tauri/Cargo.toml` in one `chore(release): x.y.z` commit (the installers take
their version from `tauri.conf.json`). Builds after it merge carry the new number.

Running the Release workflow by hand on another branch (Actions > Release > Run workflow)
builds the same installers as downloadable workflow artifacts without creating a release.
