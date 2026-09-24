# Tech stack decision

Status: accepted, 2026-09-23

## Problem

Browser-based tool for hardware network/wiring diagrams with an Obsidian style
documentation layer. Three views over the same data:

1. Schematic: device cards with named ports, wires, buses, zones, quantity stacks.
2. Documentation: per-device documents and a markdown reader with wiki-links and
   backlinks.
3. Communications: CAN frame allocations and Protobuf messages with senders, receivers
   and transports.
4. Sketches: freeform drawings.

A force-directed connection graph was tried and dropped because navigating by graph nodes
felt fragmented.

## Decision

| Layer | Choice | Notes |
|---|---|---|
| App | React 19, TypeScript, Vite | |
| Styling | Tailwind 4, lucide-react icons | shadcn-style primitives added as needed |
| Schematic | React Flow (`@xyflow/react`) | Handles map to ports. |
| Fonts | Manrope, IBM Plex Mono (`@fontsource`) | Matics brand type, bundled so the desktop app works offline. |
| PDF viewer | `pdfjs-dist` | Loaded on first use. The desktop app downloads web PDFs in Rust (`ureq`). |
| Notes editor | CodeMirror 6 (`@codemirror/*`, lang-markdown) | Obsidian-style markdown with a live preview: markup hides except on the cursor line. Wiki-links are `[[Name]]` text resolved by name. |
| State | Zustand + Immer, `zundo` for undo | One normalized store feeds all views. |
| Shell | Tauri 2 | Native window over the Vite build. Rust commands own the filesystem. |
| Persistence | Project folders on disk | `project.json` + `assets/`. `idb-keyval` remains as the browser dev fallback. |
| Routing | `react-router` | `/schematic`, `/notes/:owner?doc=`, `/io`, `/communications`, `/sketches`, `/report`. Cross-view actions are navigations. |
| Tests | Vitest | Model and derived-data logic. |

## Alternatives considered

- sigma.js / react-force-graph for the graph view. Rejected for now: a second renderer
  means duplicated node components and selection logic. Revisit above ~500 nodes.
- JointJS+: strongest built-in wiring routing (jump-overs, orthogonal), but paid.
- tldraw: freeform whiteboard, wrong shape for port-based wiring, license for production.
- maxGraph (draw.io engine): capable but not idiomatic in React.
- BlockNote (block editor): used first, dropped for plain markdown. Its block
  handles and menus fought the page, and dragging blocks was unreliable in the web view.
- Yjs as the document model: skipped since collaboration is out of scope. Adding it later
  is a real migration; decide before v1 if collab becomes likely.

## Deferred

- Wire routing around cards and crossing "humps". Candidates: `libavoid-js` (beta),
  `elkjs` for auto-layout. Slot in behind the edge path function.
- Notes as separate `notes/*.md` files in the project folder, for git-friendliness.
