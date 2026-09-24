# Contributing

## Setup

Node 22+, pnpm 10+, and Rust (stable, via https://rustup.rs) for the desktop shell.
`pnpm install`, then `pnpm desktop:dev` for the real app or `pnpm dev` for the browser-only
UI build. The first Rust compile takes a few minutes; later ones are incremental.

The filesystem is reached only through commands in `src-tauri/src/storage.rs`, wrapped by
`src/lib/desktop.ts`. Add a command there rather than enabling the generic fs plugin.

## Before committing

- `pnpm typecheck` and `pnpm test` pass.
- Commit messages follow Conventional Commits 1.0 (`feat:`, `fix:`, `chore:`, `docs:`).
- Branch names use `-` as the separator, never `/`.

## Conventions

- Views project from the store; they never hold their own copy of project data.
- Ports are logical labels. Never model physical pin numbers.
- Derived data (backlinks, graph edges, port usage) is computed in `src/model/derived.ts`,
  not stored.
- ASCII only in code and markdown (no em dashes, arrows or smart quotes).
- Comment the non-obvious "why", not the "what".

## Adding a view

Create a folder under `src/views/`, read from `useProject()`, write through store actions,
and register a route in `src/App.tsx`. Use `useSelection()` so selection carries across
views.
