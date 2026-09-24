# Development notes

How the app is put together and why, by area. The data model is in `01-data-model.md` and
the stack decision in `00-tech-stack.md`.

## App shell

- Pages: Diagram (`/schematic`), Documentation (`/notes`), Communications
  (`/communications`), Sketches (`/sketches`) and Report (`/report`). Selection lives in the
  URL (`?selected=id`), so moving between pages keeps it.
- Menu commands live in `src/lib/commands.ts` and run from three places. On macOS, the
  native menu bar (`src-tauri/src/menu.rs`) emits a "menu" event that
  `src/lib/native-menu.ts` passes on. Windows, Linux and the browser build show the in-app
  File menu in the header (`FileMenu.tsx`) instead, and on the desktop the page handles
  the menu shortcuts itself (Ctrl+N, Ctrl+O, Ctrl+1 to Ctrl+5 ...). A window menu there
  would stack a second bar between the title bar and the header. On macOS, Edit and Window
  are the platform's own items so text fields keep copy, paste and undo. WKWebView offers
  key equivalents to the page first, so the page's Cmd+S and Cmd+Z handlers still run
  while it has focus.
- Imports use the native open panel plus `read_import_file` (a file input cannot be opened
  from a menu click, which is not a user gesture); exports use the native save panel plus
  `write_export_file`.
- The charcoal app header is the title bar: a `data-tauri-drag-region`, double-click to
  maximize. On macOS the traffic lights sit in its left inset (`titleBarStyle:
  "Overlay"`). On Windows the window has no decorations (`tauri.windows.conf.json`) and
  the header draws minimize, maximize and close (`WindowControls.tsx`); close saves first.
  Linux keeps the native bar. Below 1280 px (1536 on Windows) the header drops the
  wordmark, the "Saved" text and the update version so everything fits on one row.
- Updates: `src/lib/updates.ts` checks the latest GitHub release's `latest.json` five
  seconds after launch and every six hours (never in `tauri dev`); Check for Updates in the
  menu asks right away. A newer version shows an Update button in the header. Installing
  downloads and verifies the update, saves the project (the Windows installer closes the
  app as soon as it starts), installs and relaunches. Updates are signed; the public key
  is in `tauri.conf.json` and the private key is a repository secret.
- Light theme only. Charcoal header, safety orange for primary actions and the active tab,
  warm neutrals, Manrope and IBM Plex Mono.
- Cursor language: pointer means click, grab means drag to move, crosshair means drag out a
  wire, the arrow means nothing is there, not-allowed means disabled.

## Storage and projects

- A project is a folder: `project.json` plus `assets/`. Rust commands in `storage.rs` own
  every filesystem operation (config, listing projects, atomic writes, copying picked files
  into `assets/`, moving a project to the Trash). Asset paths are validated so they cannot
  escape the project folder.
- `src/store/storage.ts` is the `ProjectStorage` interface with a desktop implementation
  (folders) and an IndexedDB one for the browser dev build. The store only talks to
  `storage`.
- Pictures and attached files are `assets/...` refs resolved through `assetSrc()` with
  Tauri's asset protocol. Inline data URLs (browser uploads, imported JSON) are written to
  `assets/` on load and save; exports inline them again so JSON stays portable.
- Autosave is debounced (400 ms). Replacing the open project flushes the pending save
  first, and editors that hold back changes (the sketch canvas) register a flush so their
  edits land in the project they came from. Cmd+S saves immediately.
- A project packages into one `.matics` file (zip of `project.json` and `assets/`). A
  `.matics` file opens as a new project from Finder or File > Open Package; Finder launches
  queue the file in Rust until the webview asks for it. Unpacking is bounded in size and
  validates the project before it is written.

## Undo

- zundo keeps 10000 whole-project snapshots. Edits within 400 ms collapse into one step, so
  typing in the inspector is one step. Sets that leave the `project` reference unchanged
  (autosave recording `saveError`) are not recorded.
- Cmd+Z undoes typing in the focused field first, then falls through to the project
  history; the desktop Edit menu's Undo and Redo do the same.
- Sketches sit outside project history: the canvas has its own undo, and stepping project
  history keeps the current sketches.

## Schematic

- Devices are cards (`DeviceNode`) showing picture, name, quantity, role, IP, the first two
  services and a documents count. Ports are small tabs on the card edges labeled with the
  bus tag or a short type (ETH, GMSL); hovering one shows the port, its peer and the bus
  rate. A device can switch to the Detailed layout from Card display, and an eye beside
  each property picks what the card shows (by default only the IP address).
- Handles are measured with `useUpdateNodeInternals` whenever the set of edge tabs
  changes, or React Flow would skip wires to them.
- Wires are orthogonal polylines (`wire-geometry.ts`): source, stub, corners, stub, target.
  Stored corners live in `Connection.route.points`; a wire without corners takes a step
  route. A selected wire's whole segment is a drag surface, and corners near a stub snap
  onto it so routed wires have no tiny jogs.
- Hops: every wire and bus bar publishes its polyline to `wire-registry.ts`; horizontal runs
  draw a semicircle where they cross a vertical run.
- Buses are bars with a minimum length. Each tap is a drag handle that stores
  `route.tapY`. Wires into a bus take the bus color, and each bus repeats a B1/B2 tag so
  color is never the only cue. The legend expands into a Networks panel with visibility
  toggles per bus and per family and a highlight for one bus (`view-state.ts`, session only).
- Wire bundles (`Project.bundles`) are harness trunks. Dropping a wire on another wire turns
  it into a bundle from the drop point; dropping on a trunk joins it; dragging a trunk end
  onto another trunk makes a tree. `trunkRuns` in `bundle-geometry.ts` splits a trunk at its
  joins so each run shows its own line count.
- Free wires (wire tool, key W) are drawn corner by corner and rendered in the viewport
  portal (`FreeWireLayer.tsx`).
- Copy and paste (`clipboard.ts`): a zone brings its devices, wires come along only when
  both ends were copied, bundles are trimmed to the copied members, and presets ride along so
  pasting into another project adds missing products. Pastes get fresh ids and shifted
  positions and undo as one step.
- Zones are grabbed by their title only, so a press that misses a port reaches the canvas.
- Image files dropped on the canvas become resizable `DiagramImage` nodes saved into
  `assets/`. `dragDropEnabled` is off in tauri.conf.json so HTML file drops reach the page.
- Navigation: two-finger scroll pans, pinch or Cmd/Ctrl + wheel zooms.
- The inspector is read-only until Edit is pressed; removal buttons appear only while
  editing. The same rule holds for every inspector in the app.

## Documentation

- Documentation belongs to the product (preset), not each placed copy. Notes and document
  links are keyed by preset id, bus id, service id, message id or document id.
- Notes are markdown edited in CodeMirror 6 with an Obsidian-style live preview
  (`views/notes/live-preview.ts`): the line with the cursor shows raw markdown. Wiki links
  are plain `[[Name]]` text, so renames rewrite them (`followRename`). `model/markdown.ts`
  reads notes for the outline, open items, excerpts, backlinks and the report.
- PDFs render with pdf.js (`components/PdfViewer.tsx`). Attached files are read through
  `read_asset_base64`; web-linked PDFs are downloaded by the `fetch_pdf` command because
  most sites refuse cross-origin requests.
- Devices carry services (software on each placed copy, with an optional TCP or UDP port).
  Each service has its own documentation page.

## Communications

- All, CAN and Protobuf tabs. CAN frames (`Project.frames`, `src/model/frames.ts`) are
  identifier allocations with sender, receivers, buses and a group. A frame lists `busIds`
  because a gateway can forward the same identifiers onto several networks.
- DBC import (`parseDbc`) reads nodes, `BO_` messages, receivers, extra transmitters and
  comments. Nodes are matched to devices by name (`matchNode`) in an import dialog.
- Protobuf messages come from `.proto` files (`src/model/proto.ts`) and get a sender and
  receivers (device plus service), a transport (suggested from the sender service's port),
  fields, documents and a note.

## Sketches

- Excalidraw 0.18, loaded lazily. Its fonts are served from `public/excalidraw/` so
  drawings render offline. Scenes save debounced; Excalidraw mutates elements in place, so
  elements are cloned both into and out of the frozen store.
- Shapes can link to a device's documentation page; links to `/...` open inside the app.
  Export writes PNG or SVG.

## Report

- `/report` renders a fixed-width document: summary counts, a read-only schematic, parts
  list, devices by zone, networks, connections, CAN frames, documents and notes.
  html-to-image turns it into pixels and jsPDF lays out A4 pages. Page breaks come from
  elements marked `data-keep` and `data-keep-with-next`. Each page renders separately
  because WebKit refuses canvases above about 16 megapixels.

## Build and release

- GitHub Actions: `ci.yml` runs the typecheck, the frontend build and `cargo check` on
  every PR; `tests.yml` runs the Vitest suite and `cargo test` on Linux. `release.yml`
  builds installers (universal macOS dmg, Windows NSIS and MSI, Linux AppImage, deb and
  rpm) with tauri-action on every push to main and publishes them as release
  `v<major>.<minor>.<run>`. The installers are not code signed; the update bundles are
  signed for the updater. The release is created as a draft; the publish job writes
  `latest.json` once every platform has uploaded (tauri-action's own merge could drop an
  entry when builds finish together) and then publishes it as the latest release.

## Known gaps

- Wire routing is manual (corners per wire); no automatic obstacle avoidance.
- Free wires cannot be attached to ports afterwards; delete and rewire instead.
- Hops are drawn only where a horizontal run crosses a vertical one.
- Assets orphaned by removing a preset or unlinking a document stay in `assets/` until
  cleaned up by hand.
- The PDF viewer draws pages as images: no text selection or in-document search.
- No code signing or notarization; installers need the first-launch steps in the README.
- Bus taps use a fixed card height estimate (`DEVICE_CARD_HEIGHT_ESTIMATE`), so taps can
  land slightly off on very tall cards.
- The report PDF is made of page images, so its text is not selectable or searchable.
- Legend toggles that hide wire families on the schematic also hide them in the report.
- The Tauri CSP is `null` and the asset protocol scope is broad (`$HOME/**`, `/Volumes/**`).
