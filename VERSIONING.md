# Versioning

Semantic Versioning 2.0.0. The current version is in `VERSION` and mirrored in
`package.json`.

- Pre-1.0: minor bumps may include breaking changes to the stored project format.
- From 1.0: a breaking change to the stored project format is a major bump and must ship
  with a migration in the store's `load()`.

Bump the version in a dedicated `chore(release): x.y.z` commit.

## Releasing

Every push to main (a merged PR or a direct push) runs the Release workflow. It builds the
macOS (universal), Windows and Linux installers and publishes them as a GitHub release.
Each build's version is the major and minor from `VERSION` with the workflow run number
as the patch: with `VERSION` at `0.1.0`, run 7 is `0.1.7`, tagged `v0.1.7`. The newest
build is the latest release, which the README's Download link and the in-app updater
point to. If any platform fails to build, the release stays a draft and the updater keeps
offering the previous one.

To change the major or minor version, set it in `VERSION`, `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` in one `chore(release): x.y.0`
commit. The patch in those files stays `0`; the workflow stamps the real one.

Running the Release workflow by hand on another branch (Actions > Release > Run workflow)
builds the same installers as downloadable workflow artifacts without creating a release.

## Update signing

The updater only installs bundles signed by the key whose public half is `pubkey` in
`src-tauri/tauri.conf.json`. The private key is the `TAURI_SIGNING_PRIVATE_KEY` repository
secret (with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has a password); the Release
workflow fails without it. Keep a backup of the private key outside GitHub: if it is lost,
installed copies cannot verify new builds and every user has to reinstall by hand once
after the key is replaced.

To build signed update bundles locally:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/matics-updater.key)" pnpm desktop:build
```
