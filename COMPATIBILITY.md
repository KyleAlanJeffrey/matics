# Compatibility

Pre-1.0: the app reads only the formats described here.

## Platforms

Desktop app built with Tauri 2: macOS is the main target and Windows is in use; Linux
builds are expected to work but are untested. The web view is the system one (WebKit on
macOS, WebView2 on Windows, WebKitGTK on Linux), so anything that works only in Chromium
is off limits.

In-app updates install the NSIS installer on Windows, the app bundle on macOS and the
AppImage on Linux. Copies installed from the `.msi`, `.deb` or `.rpm` see new releases but
update by installing the new package by hand.

## Project folder format

A project is a folder:

```
<project>/
  project.json     Project (src/model/types.ts), pretty-printed
  assets/          device pictures and attached documents, named <slug>-<hash>.<ext>
```

`project.json` carries every required field of `Project`; fields marked optional in the
type may be absent. A project missing one of its collections (saved by an older build) is
refused when a folder is opened, a diagram is imported or a package is unpacked, with a
message naming what is missing. `imageUrl` and `Document.file` reference assets by a path
relative to the folder (`assets/...`). Inline data URL pictures (from JSON imports or the
browser build) are written to `assets/` on first save.
Sketch scenes are stored in Excalidraw 0.18's element format.

Folders are found under the projects root (`~/Documents/Matics`, unless `config.json` in
the app config folder says otherwise) plus any folders opened explicitly, which
`config.json` remembers under `recent`. Renaming a project does not rename its folder.
The project home's stars, archive and last-opened times are also in `config.json`
(`starred`, `archived`, `opened`), keyed by folder path, so they stay on this computer and
never travel inside a project or package.

Writes are atomic (temp file then rename). Deleting a project moves the folder to the
Trash. Two machines editing the same synced folder at once will overwrite each other;
there is no merge.

Export files: `*.diagram.json` (`ProjectFile`) and `*.products.json` (`PresetLibraryFile`),
both with a `kind` and `version` field. The products file carries the exported presets
with their `notes`, `documents` and `docLinks`. Exports inline pictures as data URLs so
the file is self-contained. Attached documents are not exported; only their titles and
external URLs are. To share everything, share the project folder or a package.

Packages: `*.matics` is a zip of a project folder, `project.json` at the root and the
flat `assets/` files beside it. Opening one ignores any other entries and always gives the
project a new id, so a package can be opened next to the project it came from.

## Browser dev build

`pnpm dev` in a browser stores projects in IndexedDB (`diagram-maker:projects`,
`diagram-maker:project:<id>`, `diagram-maker:current`, and the project home's
`diagram-maker:workspace`, keyed by project id) and pictures inline as data URLs.
Project-folder assets cannot be shown there. This mode exists for UI work only.

## Note content

Notes are markdown strings. Wiki links are written `[[Name]]` or `[[Name|shown text]]` and
resolve by name (case-insensitive) to a product, bus or document, then to a placed device's
product, then to an id. Renaming a product, bus or document rewrites the links that pointed
at it.

Documentation opens at `/notes/<owner>?doc=<document>`. A document, service or placed
device id in place of `<owner>` opens the page that owns it.
