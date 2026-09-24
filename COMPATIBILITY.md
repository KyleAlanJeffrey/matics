# Compatibility

Pre-1.0: the app reads only the formats described here.

## Platforms

Desktop app built with Tauri 2: macOS is the developed and tested target; Windows and
Linux builds are expected to work but are untested. The web view is the system one
(WebKit on macOS), so anything that works only in Chromium is off limits.

## Project folder format

A project is a folder:

```
<project>/
  project.json     Project (src/model/types.ts), pretty-printed
  assets/          device pictures and attached documents, named <slug>-<hash>.<ext>
```

`project.json` carries every required field of `Project`; fields marked optional in the
type may be absent. `imageUrl` and `Document.file` reference assets by a path relative to
the folder (`assets/...`). Bundled sample pictures use `/devices/...`. Inline data URL
pictures (from JSON imports or the browser build) are written to `assets/` on first save.
Sketch scenes are stored in Excalidraw 0.18's element format.

Folders are found under the projects root (`~/Documents/Matics`, unless `config.json` in
the app config folder says otherwise) plus any folders opened explicitly, which
`config.json` remembers under `recent`. Renaming a project does not rename its folder.

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
`diagram-maker:project:<id>`, `diagram-maker:current`) and pictures inline as data URLs.
Project-folder assets cannot be shown there. This mode exists for UI work only.

## Note content

Notes are markdown strings. Wiki links are written `[[Name]]` or `[[Name|shown text]]` and
resolve by name (case-insensitive) to a product, bus or document, then to a placed device's
product, then to an id. Renaming a product, bus or document rewrites the links that pointed
at it.

Documentation opens at `/notes/<owner>?doc=<document>`. A document, service or placed
device id in place of `<owner>` opens the page that owns it.
