import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  isBusRef,
  type Bus,
  type CanFrame,
  type Connection,
  type DevicePreset,
  DEFAULT_CARD_PROPS,
  type CardDisplay,
  type DeviceService,
  type DiagramImage,
  type DocLink,
  type Document,
  type DocumentKind,
  type FreeWire,
  type IoModule,
  type IoSignal,
  type NetInterface,
  type NetMapping,
  type Note,
  type NoteContent,
  type PortRef,
  type Position,
  type ProtoMessage,
  type Route,
  type Sketch,
  type Project,
  type WireBundle,
  type ProjectMeta,
  type WorkspacePrefs,
  type Zone,
} from "@/model/types";
import { sampleProject } from "@/model/sample-project";
import type { ImportedModule } from "@/model/io";
import type { ImportedInterface } from "@/model/net";
import { resolveWikiTarget } from "@/model/derived";
import { renameWikiLinks } from "@/model/markdown";
import { busGeometry, DEFAULT_BUS_LENGTH } from "@/views/diagram/to-flow";
import { moveCorner, nearestOnPolyline, polylineFrom, polylineUntil } from "@/views/diagram/wire-geometry";
import { safeFilename } from "./persistence";
import { storage } from "./storage";
import { desktop, fileName, isDesktop } from "@/lib/desktop";
import { inlineAssets, isAssetRef } from "@/lib/assets";
import { pasteSelection, type DiagramClipboard } from "@/views/diagram/clipboard";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// The product library: presets plus the documentation attached to them.
interface Library {
  presets: DevicePreset[];
  notes: Note[];
  documents: Document[];
  docLinks: DocLink[];
}

function libraryOf(project: Project): Library {
  const presetIds = new Set(Object.keys(project.presets));
  const docLinks = project.docLinks.filter((link) =>
    presetIds.has(link.entityId),
  );
  const documentIds = new Set(docLinks.map((link) => link.documentId));
  return {
    presets: Object.values(project.presets),
    notes: Object.values(project.notes).filter((note) =>
      presetIds.has(note.entityId),
    ),
    documents: Object.values(project.documents).filter(
      (doc) =>
        documentIds.has(doc.id) ||
        (doc.scope === "preset" && doc.presetId && presetIds.has(doc.presetId)),
    ),
    docLinks,
  };
}

function emptyLibrary(): Library {
  return { presets: [], notes: [], documents: [], docLinks: [] };
}

function emptyProject(name: string, library: Library): Project {
  const copy = structuredClone(library);
  return {
    id: newId("project"),
    name,
    presets: Object.fromEntries(copy.presets.map((p) => [p.id, p])),
    devices: {},
    buses: {},
    zones: {},
    connections: {},
    freeWires: {},
    bundles: {},
    images: {},
    documents: Object.fromEntries(copy.documents.map((d) => [d.id, d])),
    docLinks: copy.docLinks,
    notes: Object.fromEntries(copy.notes.map((n) => [n.entityId, n])),
    frames: {},
    messages: {},
    sketches: {},
    ioModules: {},
    ioSignals: {},
    netInterfaces: {},
    netMappings: {},
    routes: {},
  };
}

export interface IoMapImportResult {
  modules: number;
  added: number;
  updated: number;
  interfaces: number;
  mappingsAdded: number;
  mappingsUpdated: number;
}

interface ProjectState {
  project: Project;
  projects: ProjectMeta[];
  // Folder of the open project (desktop app only).
  projectDir: string | null;
  // Folder that holds the project folders (desktop app only).
  workspaceDir: string | null;
  prefs: WorkspacePrefs;
  loaded: boolean;
  // Why the project could not be loaded or saved, for the UI to show.
  loadError: string | null;
  saveError: string | null;
  load: () => Promise<void>;

  createProject: (
    name: string,
    options?: { copyLibrary?: boolean; fromSample?: boolean },
  ) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  // Reads another project for its preview on the project home, without opening it.
  peekProject: (projectId: string) => Promise<unknown>;
  setStarred: (projectId: string, starred: boolean) => Promise<void>;
  setArchived: (projectId: string, archived: boolean) => Promise<void>;
  renameProject: (name: string) => void;
  setProjectDescription: (description: string) => void;
  duplicateProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  // Writes the project now instead of waiting for the autosave.
  saveNow: () => Promise<void>;
  // Desktop only: open a .matics project from anywhere, show the current one in Finder,
  // copy a picked file into the project's assets folder.
  // A .matics folder opens where it is; a compressed .matics file opens as a new project.
  openProjectPath: (path: string) => Promise<void>;
  // The whole project folder, pictures and attached files included, as one .matics file.
  saveCompressedCopy: () => Promise<void>;
  revealProject: () => Promise<void>;
  pickAsset: (
    kind: "image" | "document",
  ) => Promise<{ rel: string; name: string } | null>;

  addPreset: (preset: Omit<DevicePreset, "id">) => string;
  updatePreset: (
    presetId: string,
    patch: Partial<Omit<DevicePreset, "id">>,
  ) => void;
  removePreset: (presetId: string) => void;

  addDevice: (presetId: string, position: Position) => string;
  // Adds copied items with fresh ids; returns them (zones first).
  pasteSelection: (payload: DiagramClipboard, offset: Position) => string[];
  removeDevice: (deviceId: string) => void;
  moveDevice: (deviceId: string, position: Position) => void;
  updateDevice: (
    deviceId: string,
    patch: Partial<Pick<Project["devices"][string], "name" | "qty" | "zoneId">>,
  ) => void;
  setDeviceProp: (deviceId: string, key: string, value: string) => void;
  removeDeviceProp: (deviceId: string, key: string) => void;
  setCardDisplay: (deviceId: string, patch: CardDisplay) => void;
  addService: (deviceId: string, service: Omit<DeviceService, "id">) => string;
  updateService: (deviceId: string, serviceId: string, patch: Partial<Omit<DeviceService, "id">>) => void;
  removeService: (deviceId: string, serviceId: string) => void;

  addBus: (position: Position) => string;
  updateBus: (
    busId: string,
    patch: Partial<Pick<Bus, "name" | "rate" | "kind" | "tag" | "color" | "variant" | "repeatLabels" | "length">>,
  ) => void;
  moveBus: (busId: string, position: Position) => void;
  removeBus: (busId: string) => void;

  addFrame: (frame?: Partial<Omit<CanFrame, "id">>) => string;
  // Several frames in one undo step (DBC import).
  addFrames: (frames: Omit<CanFrame, "id">[]) => string[];
  updateFrame: (frameId: string, patch: Partial<Omit<CanFrame, "id">>) => void;
  removeFrame: (frameId: string) => void;

  addMessage: (message?: Partial<Omit<ProtoMessage, "id">>) => string;
  // A parsed .proto file in one undo step. Messages already imported from the same file
  // with the same name get the new fields; their routing and notes stay.
  importMessages: (messages: Omit<ProtoMessage, "id" | "receivers">[]) => { added: number; updated: number };
  updateMessage: (messageId: string, patch: Partial<Omit<ProtoMessage, "id">>) => void;
  removeMessage: (messageId: string) => void;

  addIoModule: (module: Omit<IoModule, "id">) => string;
  updateIoModule: (moduleId: string, patch: Partial<Omit<IoModule, "id">>) => void;
  // Removes the module's signals with it.
  removeIoModule: (moduleId: string) => void;
  addIoSignal: (signal: Omit<IoSignal, "id">) => string;
  updateIoSignal: (signalId: string, patch: Partial<Omit<IoSignal, "id">>) => void;
  removeIoSignal: (signalId: string) => void;
  // A parsed I/O mapping for one controller, in one undo step. Modules match by name and
  // signals by channel; a match gets the new binding and keeps its field device, pin,
  // range and notes. Interfaces match by module and name and their mappings by symbol; a
  // match keeps its name, register, peer and notes.
  importIoMap: (deviceId: string, modules: ImportedModule[], interfaces: ImportedInterface[]) => IoMapImportResult;
  addNetInterface: (netInterface: Omit<NetInterface, "id">) => string;
  updateNetInterface: (interfaceId: string, patch: Partial<Omit<NetInterface, "id">>) => void;
  // Removes the interface's mappings with it.
  removeNetInterface: (interfaceId: string) => void;
  addNetMapping: (mapping: Omit<NetMapping, "id">) => string;
  updateNetMapping: (mappingId: string, patch: Partial<Omit<NetMapping, "id">>) => void;
  removeNetMapping: (mappingId: string) => void;
  addRoute: (route: Omit<Route, "id">) => string;
  updateRoute: (routeId: string, patch: Partial<Omit<Route, "id">>) => void;
  // Messages that travelled on the route keep their own sender and receivers.
  removeRoute: (routeId: string) => void;

  // Sketches sit outside the project undo history entirely (see keepSketches).
  addSketch: (name: string) => string;
  updateSketch: (sketchId: string, patch: Partial<Pick<Sketch, "name" | "deviceIds">>) => void;
  // The drawing itself. Kept out of the undo history: Excalidraw has its own undo.
  saveSketchScene: (sketchId: string, elements: unknown[], files: Record<string, unknown>) => void;
  removeSketch: (sketchId: string) => void;
  // Puts sketches back after a project undo or redo restored an older snapshot of them.
  keepSketches: (sketches: Project["sketches"]) => void;

  addZone: (position: Position) => string;
  updateZone: (
    zoneId: string,
    patch: Partial<Pick<Zone, "name" | "position" | "size">>,
  ) => void;
  moveZoneWithContents: (zoneId: string, position: Position) => void;
  removeZone: (zoneId: string) => void;

  addConnection: (connection: Omit<Connection, "id">) => void;
  updateConnection: (
    connectionId: string,
    patch: Partial<Pick<Connection, "lineCount" | "label" | "route">>,
  ) => void;
  removeConnection: (connectionId: string) => void;

  // Bundles: several wires sharing one trunk in transit.
  createBundle: (connectionIds: string[], points: Position[], label?: string) => string;
  addToBundle: (bundleId: string, connectionId: string) => void;
  removeFromBundle: (connectionId: string) => void;
  updateBundle: (bundleId: string, patch: Partial<Pick<WireBundle, "label" | "points">>) => void;
  dissolveBundle: (bundleId: string) => void;
  // Direct-manipulation bundling: a wire dropped on a wire or trunk joins it where it
  // landed, and a trunk end dropped on another wire or trunk runs into it there.
  attachWireToWire: (hostId: string, from: PortRef, hostPolyline: Position[], point: Position) => string | undefined;
  attachWireToBundle: (bundleId: string, from: PortRef, point: Position) => string | undefined;
  linkBundle: (childId: string, parentId: string, point: Position) => void;
  linkBundleToWire: (childId: string, hostId: string, hostPolyline: Position[], point: Position) => void;
  unlinkBundle: (childId: string) => void;

  addFreeWire: (wire: Omit<FreeWire, "id">) => string;
  updateFreeWire: (
    wireId: string,
    patch: Partial<Omit<FreeWire, "id">>,
  ) => void;
  removeFreeWire: (wireId: string) => void;

  addImage: (image: Omit<DiagramImage, "id">) => string;
  updateImage: (imageId: string, patch: Partial<Pick<DiagramImage, "name" | "position" | "size">>) => void;
  removeImage: (imageId: string) => void;

  setNote: (entityId: string, content: NoteContent) => void;

  // Documentation links: a document plus its association with a product, bus or device.
  // A null entity makes an unfiled document.
  addDocumentLink: (
    entityId: string | null,
    doc: { title: string; url?: string; file?: string; kind: DocumentKind },
  ) => string;
  // Links an existing document to one more entity; a shared document is one record.
  linkDocument: (documentId: string, entityId: string) => void;
  deleteDocument: (documentId: string) => void;
  updateDocument: (
    documentId: string,
    patch: Partial<Pick<Document, "title" | "url" | "kind">>,
  ) => void;
  unlinkDocument: (documentId: string, entityId: string) => void;
}

// Edits that land within this window collapse into one undo step (typing, slider drags).
const UNDO_COALESCE_MS = 400;

let loadPromise: Promise<void> | null = null;

// A removed service takes its own note and its document links with it; the documents stay.
// Defaults are stored as absent, so a card set back to the defaults leaves no trace.
function cleanCardDisplay(card: CardDisplay): CardDisplay | undefined {
  const clean: CardDisplay = {};
  if (card.layout === "detailed") clean.layout = card.layout;
  if (card.picture && card.picture !== "large") clean.picture = card.picture;
  if (card.services === "all") clean.services = card.services;
  if (card.props) {
    const props = [...new Set(card.props)];
    const isDefault = props.length === DEFAULT_CARD_PROPS.length && DEFAULT_CARD_PROPS.every((key) => props.includes(key));
    if (!isDefault) clean.props = props;
  }
  return Object.keys(clean).length ? clean : undefined;
}

function forgetEntity(project: Project, entityId: string) {
  delete project.notes[entityId];
  project.docLinks = project.docLinks.filter((link) => link.entityId !== entityId);
}

// A removed device or service leaves messages and routes to it without that end.
function forgetEndpoint(project: Project, deviceId: string, serviceId?: string) {
  const matches = (end: { deviceId: string; serviceId?: string } | undefined) =>
    !!end && end.deviceId === deviceId && (!serviceId || end.serviceId === serviceId);
  for (const message of Object.values(project.messages)) {
    if (serviceId) {
      if (matches(message.sender)) delete message.sender!.serviceId;
      for (const receiver of message.receivers) if (matches(receiver)) delete receiver.serviceId;
    } else {
      if (matches(message.sender)) delete message.sender;
      message.receivers = message.receivers.filter((r) => !matches(r));
    }
  }
  for (const route of Object.values(project.routes)) {
    for (const end of ["from", "to"] as const) {
      if (!matches(route[end])) continue;
      if (serviceId) delete route[end]!.serviceId;
      else delete route[end];
    }
  }
}

function dropIoModule(project: Project, moduleId: string) {
  for (const signal of Object.values(project.ioSignals)) {
    if (signal.moduleId !== moduleId) continue;
    delete project.ioSignals[signal.id];
    forgetEntity(project, signal.id);
  }
  delete project.ioModules[moduleId];
  forgetEntity(project, moduleId);
}

// A removed device takes its modules and interfaces with it, and leaves no signal wired to it.
function forgetIoDevice(project: Project, deviceId: string) {
  for (const module of Object.values(project.ioModules)) if (module.deviceId === deviceId) dropIoModule(project, module.id);
  for (const signal of Object.values(project.ioSignals)) if (signal.fieldDeviceId === deviceId) delete signal.fieldDeviceId;
  for (const netInterface of Object.values(project.netInterfaces)) {
    if (netInterface.peerDeviceId === deviceId) delete netInterface.peerDeviceId;
    if (netInterface.deviceId === deviceId) dropNetInterface(project, netInterface.id);
  }
}

function dropNetInterface(project: Project, interfaceId: string) {
  for (const mapping of Object.values(project.netMappings)) {
    if (mapping.interfaceId !== interfaceId) continue;
    delete project.netMappings[mapping.id];
    forgetEntity(project, mapping.id);
  }
  delete project.netInterfaces[interfaceId];
  forgetEntity(project, interfaceId);
}

// Inside a set() the project is an immer draft; this runs a set that undo will not record.
function withoutHistory(run: () => void) {
  const history = useProjectStore.temporal.getState();
  history.pause();
  try {
    run();
  } finally {
    history.resume();
  }
}

// Wiki links name their target, so a rename rewrites the links that pointed at it.
// Only links that resolved to this entity move; another entity with the old name keeps its own.
function followRename(project: Project, entityId: string, old: string, next: string) {
  if (!next.trim() || old.trim() === next.trim() || resolveWikiTarget(project, old) !== entityId) return;
  for (const note of Object.values(project.notes)) note.content = renameWikiLinks(note.content, old, next.trim());
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    immer((set, get) => ({
      project: sampleProject,
      projects: [],
      projectDir: null,
      workspaceDir: null,
      prefs: { starred: [], archived: [], opened: {} },
      loaded: false,
      loadError: null,
      saveError: null,

      load: async () => {
        // React StrictMode runs effects twice in dev; a second concurrent load would
        // create a second copy of the sample project on disk.
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
          set((state) => {
            state.loadError = null;
          });
          let { projects: index, currentId, prefs } = await storage.init();
          set((state) => {
            state.prefs = prefs;
            state.workspaceDir = storage.rootDir || null;
          });
          // A project that cannot be opened (one saved by an older build) is skipped, so
          // it cannot keep the app from starting; the others still open.
          const candidates = [...new Set([currentId, ...index.map((m) => m.id)])].filter((id): id is string => !!id);
          const skipped: string[] = [];
          let project: Project | undefined;
          for (const id of candidates) {
            try {
              project = await storage.load(id);
            } catch (error) {
              skipped.push(error instanceof Error ? error.message : String(error));
            }
            if (project) break;
          }
          if (skipped.length > 0) setTimeout(() => window.alert(skipped.join("\n\n")));
          if (!project) {
            project = structuredClone(sampleProject);
            await storage.save(project);
            const sample = withDir(meta(project));
            // Keep the skipped projects; the browser build would otherwise lose them from its index.
            index = [...index.filter((m) => m.id !== sample.id), sample];
            await storage.updateIndex(index);
          }
          await setCurrent(project.id, set, get);
          set((state) => {
            state.project = project!;
            state.projects = index;
            state.projectDir = storage.dirOf(project!.id);
            state.loaded = true;
          });
          useProjectStore.temporal.getState().clear();
        })().catch((error: unknown) => {
          // Leave the sample project in memory but say so; a retry may succeed.
          loadPromise = null;
          set((state) => {
            state.loadError = error instanceof Error ? error.message : String(error);
          });
        });
        return loadPromise;
      },

      createProject: async (name, options = {}) => {
        const current = get().project;
        const project = options.fromSample
          ? { ...structuredClone(sampleProject), id: newId("project"), name }
          : emptyProject(
              name,
              options.copyLibrary === false
                ? emptyLibrary()
                : libraryOf(current),
            );
        await adoptProject(project, set, get);
      },

      switchProject: async (projectId) => {
        if (projectId === get().project.id) return;
        await flushPendingSave();
        const project = await storage.load(projectId);
        if (!project) throw new Error("That project could not be found. Its folder may have been moved or deleted.");
        await setCurrent(projectId, set, get);
        set((state) => {
          state.project = project;
          state.projectDir = storage.dirOf(projectId);
        });
        useProjectStore.temporal.getState().clear();
      },

      peekProject: (projectId) => storage.peek(projectId),

      setStarred: (projectId, starred) =>
        updatePrefs(set, get, (prefs) => {
          prefs.starred = toggled(prefs.starred, prefKey(projectId), starred);
        }),

      setArchived: (projectId, archived) =>
        updatePrefs(set, get, (prefs) => {
          prefs.archived = toggled(prefs.archived, prefKey(projectId), archived);
        }),

      renameProject: (name) =>
        set((state) => {
          state.project.name = name;
          const entry = state.projects.find((m) => m.id === state.project.id);
          if (entry) entry.name = name;
        }),

      setProjectDescription: (description) =>
        set((state) => {
          state.project.description = description.trim() || undefined;
        }),

      duplicateProject: async () => {
        flushBufferedEditors();
        // Pictures travel inline so the copy gets its own files in its own folder.
        const sourceDir = get().projectDir;
        const source = await exportable(get().project, sourceDir);
        const copy = {
          ...source,
          id: newId("project"),
          name: `${source.name} copy`,
        };
        await adoptProject(copy, set, get);
        // Attached files are not inlined; copy them across so the links keep working.
        const targetDir = storage.dirOf(copy.id);
        if (!sourceDir || !targetDir || !isDesktop()) return;
        for (const doc of Object.values(copy.documents)) {
          if (!isAssetRef(doc.file)) continue;
          try {
            await desktop.copyAsset(sourceDir, targetDir, doc.file);
          } catch {
            // The source file is already missing; the copy's link is as broken as the original.
          }
        }
      },

      deleteProject: async (projectId) => {
        await flushPendingSave();
        const remaining = get().projects.filter((m) => m.id !== projectId);
        // The key has to be read before the folder is forgotten.
        const key = prefKey(projectId);
        await storage.remove(projectId);
        // Leftover keys for a folder that is gone are harmless, so a failed write here must
        // not fail the delete.
        await updatePrefs(set, get, (prefs) => {
          prefs.starred = prefs.starred.filter((k) => k !== key);
          prefs.archived = prefs.archived.filter((k) => k !== key);
          delete prefs.opened[key];
        }).catch(() => {});
        if (get().project.id === projectId) {
          let next =
            remaining.length > 0
              ? await storage.load(remaining[0].id)
              : undefined;
          if (!next) {
            next = emptyProject("Untitled project", libraryOf(get().project));
            await storage.save(next);
            remaining.push(withDir(meta(next)));
          }
          await setCurrent(next.id, set, get);
          set((state) => {
            state.project = next!;
            state.projects = remaining;
            state.projectDir = storage.dirOf(next!.id);
          });
          useProjectStore.temporal.getState().clear();
        } else {
          set((state) => {
            state.projects = remaining;
          });
        }
        await storage.updateIndex(remaining);
      },

      saveNow: async () => {
        if (!pendingSave) pendingSave = { project: get().project, projects: get().projects };
        await flushPendingSave();
      },

      saveCompressedCopy: async () => {
        await get().saveNow();
        if (get().saveError) throw new Error(`The project could not be saved, so no copy was made: ${get().saveError}`);
        const dir = get().projectDir;
        if (!dir) throw new Error("This project has no folder yet.");
        const name = `${safeFilename(get().project.name)}.${MATICS_EXTENSION}`;
        const path = await desktop.pickSavePath("Save compressed copy", name, [MATICS_FILTER]);
        if (path) await desktop.compressProject(dir, path);
      },

      openProjectPath: async (path) => {
        if (!storage.openPath) return;
        const opened = await storage.openPath(path);
        if (!get().projects.some((m) => m.id === opened.id)) {
          set((state) => {
            state.projects = [...state.projects, opened];
          });
        }
        await get().switchProject(opened.id);
      },

      revealProject: async () => {
        const dir = get().projectDir;
        if (dir) await desktop.reveal(dir);
      },

      pickAsset: async (kind) => {
        const dir = get().projectDir;
        if (!dir || !isDesktop()) return null;
        const filters =
          kind === "image"
            ? [
                {
                  name: "Images",
                  extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
                },
              ]
            : [
                {
                  name: "Documents",
                  extensions: [
                    "pdf",
                    "png",
                    "jpg",
                    "jpeg",
                    "txt",
                    "md",
                    "csv",
                    "xlsx",
                    "docx",
                  ],
                },
              ];
        const source = await desktop.pickFile(
          kind === "image" ? "Choose a device picture" : "Attach a document",
          filters,
        );
        if (!source) return null;
        const rel = await desktop.importAsset(dir, source);
        return { rel, name: fileName(source) };
      },

      addPreset: (preset) => {
        const id = newId("preset");
        set((state) => {
          state.project.presets[id] = { id, ...preset };
        });
        return id;
      },

      updatePreset: (presetId, patch) =>
        set((state) => {
          const preset = state.project.presets[presetId];
          if (!preset) return;
          if (patch.name !== undefined) followRename(state.project, presetId, preset.name, patch.name);
          Object.assign(preset, patch);
        }),

      removePreset: (presetId) =>
        set((state) => {
          const inUse = Object.values(state.project.devices).some(
            (d) => d.presetId === presetId,
          );
          if (inUse) return;
          delete state.project.presets[presetId];
          delete state.project.notes[presetId];
          state.project.docLinks = state.project.docLinks.filter(
            (link) => link.entityId !== presetId,
          );
        }),

      addDevice: (presetId, position) => {
        const id = newId(presetId);
        set((state) => {
          const preset = state.project.presets[presetId];
          if (!preset) return;
          const zone = Object.values(state.project.zones).find((z) =>
            containsPoint(z, position),
          );
          state.project.devices[id] = {
            id,
            presetId,
            name: preset.name,
            zoneId: zone?.id ?? null,
            qty: 1,
            position,
            props: {},
          };
        });
        return id;
      },

      pasteSelection: (payload, offset) => {
        let created: string[] = [];
        set((state) => {
          created = pasteSelection(state.project, payload, offset, newId);
        });
        return created;
      },

      removeDevice: (deviceId) =>
        set((state) => {
          // Wires go first: dropConnection measures the bus bar while the tap still draws.
          for (const conn of Object.values(state.project.connections)) {
            const touches =
              conn.from.deviceId === deviceId ||
              (!isBusRef(conn.to) && conn.to.deviceId === deviceId);
            if (touches) dropConnection(state.project, conn.id);
          }
          for (const service of state.project.devices[deviceId]?.services ?? []) forgetEntity(state.project, service.id);
          forgetEndpoint(state.project, deviceId);
          forgetIoDevice(state.project, deviceId);
          delete state.project.devices[deviceId];
          state.project.docLinks = state.project.docLinks.filter(
            (link) => link.entityId !== deviceId,
          );
        }),

      moveDevice: (deviceId, position) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (!device) return;
          device.position = position;
          const zone = Object.values(state.project.zones).find((z) =>
            containsPoint(z, position),
          );
          device.zoneId = zone?.id ?? null;
        }),

      updateDevice: (deviceId, patch) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (!device) return;
          if (patch.name !== undefined) device.name = patch.name;
          if (patch.qty !== undefined)
            device.qty = Math.max(1, Math.floor(patch.qty) || 1);
          if (patch.zoneId !== undefined) device.zoneId = patch.zoneId;
        }),

      setDeviceProp: (deviceId, key, value) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (device) device.props[key] = value;
        }),

      removeDeviceProp: (deviceId, key) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (!device) return;
          delete device.props[key];
          if (device.card?.props) {
            const card = cleanCardDisplay({ ...device.card, props: device.card.props.filter((k) => k !== key) });
            if (card) device.card = card;
            else delete device.card;
          }
        }),

      setCardDisplay: (deviceId, patch) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (!device) return;
          const card = cleanCardDisplay({ ...device.card, ...patch });
          if (card) device.card = card;
          else delete device.card;
        }),

      addService: (deviceId, service) => {
        const id = newId("svc");
        set((state) => {
          const device = state.project.devices[deviceId];
          if (device) (device.services ??= []).push({ ...service, id });
        });
        return id;
      },

      updateService: (deviceId, serviceId, patch) =>
        set((state) => {
          const service = state.project.devices[deviceId]?.services?.find((s) => s.id === serviceId);
          if (!service) return;
          Object.assign(service, patch);
          // An explicit undefined clears the field rather than storing it.
          for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete service[key];
        }),

      removeService: (deviceId, serviceId) =>
        set((state) => {
          const device = state.project.devices[deviceId];
          if (!device?.services) return;
          device.services = device.services.filter((s) => s.id !== serviceId);
          forgetEntity(state.project, serviceId);
          forgetEndpoint(state.project, deviceId, serviceId);
        }),

      addBus: (position) => {
        const id = newId("bus");
        set((state) => {
          const count = Object.keys(state.project.buses).length + 1;
          state.project.buses[id] = {
            id,
            name: `Bus ${count}`,
            tag: `B${count}`,
            kind: "can",
            rate: "Rate TBD",
            position,
            width: 0,
            length: DEFAULT_BUS_LENGTH,
          };
        });
        return id;
      },

      updateBus: (busId, patch) =>
        set((state) => {
          const bus = state.project.buses[busId];
          if (!bus) return;
          if (patch.name !== undefined) followRename(state.project, busId, bus.name, patch.name);
          Object.assign(bus, patch);
        }),

      moveBus: (busId, position) =>
        set((state) => {
          const bus = state.project.buses[busId];
          if (bus) bus.position = position;
        }),

      removeBus: (busId) =>
        set((state) => {
          delete state.project.buses[busId];
          for (const frame of Object.values(state.project.frames)) frame.busIds = frame.busIds.filter((id) => id !== busId);
          delete state.project.notes[busId];
          for (const conn of Object.values(state.project.connections)) {
            if (isBusRef(conn.to) && conn.to.busId === busId)
              dropConnection(state.project, conn.id);
          }
          state.project.docLinks = state.project.docLinks.filter(
            (link) => link.entityId !== busId,
          );
        }),

      addFrame: (frame) => {
        const id = newId("frame");
        set((state) => {
          const count = Object.keys(state.project.frames).length + 1;
          const firstDevice = Object.keys(state.project.devices)[0] ?? "";
          state.project.frames[id] = {
            id,
            name: `Frame ${count}`,
            startId: 0,
            endId: 0,
            senderId: firstDevice,
            receiverIds: [],
            busIds: [],
            ...frame,
          };
        });
        return id;
      },

      addFrames: (frames) => {
        const ids = frames.map(() => newId("frame"));
        set((state) => {
          frames.forEach((frame, i) => {
            state.project.frames[ids[i]] = { id: ids[i], ...frame };
          });
        });
        return ids;
      },

      updateFrame: (frameId, patch) =>
        set((state) => {
          const frame = state.project.frames[frameId];
          if (frame) Object.assign(frame, patch);
        }),

      removeFrame: (frameId) =>
        set((state) => {
          delete state.project.frames[frameId];
        }),

      addMessage: (message) => {
        const id = newId("msg");
        set((state) => {
          const count = Object.keys(state.project.messages).length + 1;
          state.project.messages[id] = { id, name: `Message${count}`, fields: [], receivers: [], ...message };
        });
        return id;
      },

      importMessages: (messages) => {
        let added = 0;
        let updated = 0;
        set((state) => {
          const existing = Object.values(state.project.messages);
          for (const message of messages) {
            // Two packages can each ship a common.proto with the same message names.
            const match = existing.find(
              (m) => m.name === message.name && m.schemaFile === message.schemaFile && m.package === message.package,
            );
            if (match) {
              match.fields = message.fields;
              match.version = message.version;
              updated++;
            } else {
              const id = newId("msg");
              state.project.messages[id] = { id, receivers: [], ...message };
              added++;
            }
          }
        });
        return { added, updated };
      },

      updateMessage: (messageId, patch) =>
        set((state) => {
          const message = state.project.messages[messageId];
          if (message) Object.assign(message, patch);
        }),

      removeMessage: (messageId) =>
        set((state) => {
          delete state.project.messages[messageId];
          forgetEntity(state.project, messageId);
        }),

      addIoModule: (module) => {
        const id = newId("iomod");
        set((state) => {
          state.project.ioModules[id] = { id, ...module };
        });
        return id;
      },

      updateIoModule: (moduleId, patch) =>
        set((state) => {
          const module = state.project.ioModules[moduleId];
          if (module) Object.assign(module, patch);
        }),

      removeIoModule: (moduleId) =>
        set((state) => {
          dropIoModule(state.project, moduleId);
        }),

      addIoSignal: (signal) => {
        const id = newId("signal");
        set((state) => {
          state.project.ioSignals[id] = { id, ...signal };
        });
        return id;
      },

      updateIoSignal: (signalId, patch) =>
        set((state) => {
          const signal = state.project.ioSignals[signalId];
          if (signal) Object.assign(signal, patch);
        }),

      removeIoSignal: (signalId) =>
        set((state) => {
          delete state.project.ioSignals[signalId];
          forgetEntity(state.project, signalId);
        }),

      importIoMap: (deviceId, modules, interfaces) => {
        const result: IoMapImportResult = { modules: 0, added: 0, updated: 0, interfaces: 0, mappingsAdded: 0, mappingsUpdated: 0 };
        set((state) => {
          const project = state.project;
          for (const imported of modules) {
            let module = Object.values(project.ioModules).find((m) => m.deviceId === deviceId && m.name === imported.name);
            if (!module) {
              const id = newId("iomod");
              module = project.ioModules[id] = { id, deviceId, name: imported.name };
              result.modules++;
            }
            const existing = Object.values(project.ioSignals).filter((s) => s.moduleId === module.id);
            for (const signal of imported.signals) {
              const match = existing.find((s) => s.channel === signal.channel);
              if (match) {
                // A renamed signal keeps its name while its variable stays the same.
                if (match.variable !== signal.variable) match.name = signal.name;
                Object.assign(match, { kind: signal.kind, direction: signal.direction, variable: signal.variable, task: signal.task, settings: signal.settings });
                result.updated++;
              } else {
                const id = newId("signal");
                project.ioSignals[id] = { id, moduleId: module.id, ...signal };
                result.added++;
              }
            }
          }
          for (const imported of interfaces) {
            let netInterface = Object.values(project.netInterfaces).find((i) => i.deviceId === deviceId && i.module === imported.module && i.name === imported.name);
            if (!netInterface) {
              const id = newId("netif");
              netInterface = project.netInterfaces[id] = { id, deviceId, module: imported.module, name: imported.name, protocol: "Modbus" };
              result.interfaces++;
            }
            const existing = Object.values(project.netMappings).filter((m) => m.interfaceId === netInterface.id);
            for (const mapping of imported.mappings) {
              const match = existing.find((m) => m.symbol === mapping.symbol);
              if (match) {
                Object.assign(match, { direction: mapping.direction, variable: mapping.variable, task: mapping.task });
                result.mappingsUpdated++;
              } else {
                const id = newId("netmap");
                project.netMappings[id] = { id, interfaceId: netInterface.id, ...mapping };
                result.mappingsAdded++;
              }
            }
          }
        });
        return result;
      },

      addNetInterface: (netInterface) => {
        const id = newId("netif");
        set((state) => {
          state.project.netInterfaces[id] = { id, ...netInterface };
        });
        return id;
      },

      updateNetInterface: (interfaceId, patch) =>
        set((state) => {
          const netInterface = state.project.netInterfaces[interfaceId];
          if (netInterface) Object.assign(netInterface, patch);
        }),

      removeNetInterface: (interfaceId) =>
        set((state) => {
          dropNetInterface(state.project, interfaceId);
        }),

      addNetMapping: (mapping) => {
        const id = newId("netmap");
        set((state) => {
          state.project.netMappings[id] = { id, ...mapping };
        });
        return id;
      },

      updateNetMapping: (mappingId, patch) =>
        set((state) => {
          const mapping = state.project.netMappings[mappingId];
          if (mapping) Object.assign(mapping, patch);
        }),

      removeNetMapping: (mappingId) =>
        set((state) => {
          delete state.project.netMappings[mappingId];
          forgetEntity(state.project, mappingId);
        }),

      addRoute: (route) => {
        const id = newId("route");
        set((state) => {
          state.project.routes[id] = { id, ...route };
        });
        return id;
      },

      updateRoute: (routeId, patch) =>
        set((state) => {
          const route = state.project.routes[routeId];
          if (route) Object.assign(route, patch);
        }),

      removeRoute: (routeId) =>
        set((state) => {
          delete state.project.routes[routeId];
          for (const message of Object.values(state.project.messages)) if (message.routeId === routeId) delete message.routeId;
          forgetEntity(state.project, routeId);
        }),

      addSketch: (name) => {
        const id = newId("sketch");
        withoutHistory(() =>
          set((state) => {
            state.project.sketches[id] = { id, name, elements: [], deviceIds: [], updatedAt: new Date().toISOString() };
          }),
        );
        return id;
      },

      updateSketch: (sketchId, patch) =>
        withoutHistory(() =>
          set((state) => {
            const sketch = state.project.sketches[sketchId];
            if (sketch) Object.assign(sketch, patch);
          }),
        ),

      saveSketchScene: (sketchId, elements, files) =>
        withoutHistory(() =>
          set((state) => {
            const sketch = state.project.sketches[sketchId];
            if (!sketch) return;
            sketch.elements = elements;
            sketch.files = files;
            sketch.updatedAt = new Date().toISOString();
          }),
        ),

      removeSketch: (sketchId) =>
        withoutHistory(() =>
          set((state) => {
            delete state.project.sketches[sketchId];
          }),
        ),

      keepSketches: (sketches) =>
        withoutHistory(() =>
          set((state) => {
            state.project.sketches = sketches;
          }),
        ),

      addZone: (position) => {
        const id = newId("zone");
        set((state) => {
          const count = Object.keys(state.project.zones).length + 1;
          state.project.zones[id] = {
            id,
            name: `Zone ${count}`,
            position,
            size: { width: 480, height: 280 },
          };
        });
        return id;
      },

      updateZone: (zoneId, patch) =>
        set((state) => {
          const zone = state.project.zones[zoneId];
          if (zone) Object.assign(zone, patch);
        }),

      moveZoneWithContents: (zoneId, position) =>
        set((state) => {
          const zone = state.project.zones[zoneId];
          if (!zone) return;
          const dx = position.x - zone.position.x;
          const dy = position.y - zone.position.y;
          zone.position = position;
          for (const device of Object.values(state.project.devices)) {
            if (device.zoneId === zoneId)
              device.position = {
                x: device.position.x + dx,
                y: device.position.y + dy,
              };
          }
        }),

      addImage: (image) => {
        const id = newId("image");
        set((state) => {
          state.project.images[id] = { id, ...image };
        });
        return id;
      },

      updateImage: (imageId, patch) =>
        set((state) => {
          const image = state.project.images[imageId];
          if (image) Object.assign(image, patch);
        }),

      // The picture file stays in assets/ so undoing the removal brings it back intact.
      removeImage: (imageId) =>
        set((state) => {
          delete state.project.images[imageId];
        }),

      removeZone: (zoneId) =>
        set((state) => {
          delete state.project.zones[zoneId];
          for (const device of Object.values(state.project.devices)) {
            if (device.zoneId === zoneId) device.zoneId = null;
          }
        }),

      addConnection: (connection) =>
        set((state) => {
          const duplicate = Object.values(state.project.connections).some(
            (c) =>
              JSON.stringify(c.from) === JSON.stringify(connection.from) &&
              JSON.stringify(c.to) === JSON.stringify(connection.to),
          );
          if (duplicate) return;
          const id = newId("conn");
          state.project.connections[id] = { id, ...connection };
        }),

      updateConnection: (connectionId, patch) =>
        set((state) => {
          const connection = state.project.connections[connectionId];
          if (!connection) return;
          if (patch.lineCount !== undefined)
            connection.lineCount = Math.max(
              1,
              Math.floor(patch.lineCount) || 1,
            );
          if (patch.label !== undefined)
            connection.label = patch.label || undefined;
          if (patch.route !== undefined)
            connection.route = { ...connection.route, ...patch.route };
        }),

      removeConnection: (connectionId) =>
        set((state) => {
          dropConnection(state.project, connectionId);
        }),

      createBundle: (connectionIds, points, label) => {
        const id = newId("bundle");
        set((state) => {
          const members = connectionIds.filter((cid) => state.project.connections[cid]);
          if (members.length === 0) return;
          for (const cid of members) {
            detachFromBundle(state.project, cid);
            state.project.connections[cid].bundleId = id;
            state.project.connections[cid].route = {};
          }
          state.project.bundles[id] = { id, label: label?.trim() || undefined, points, members };
        });
        return id;
      },

      addToBundle: (bundleId, connectionId) =>
        set((state) => {
          const bundle = state.project.bundles[bundleId];
          const connection = state.project.connections[connectionId];
          if (!bundle || !connection || bundle.members.includes(connectionId)) return;
          detachFromBundle(state.project, connectionId);
          bundle.members.push(connectionId);
          connection.bundleId = bundleId;
          connection.route = {};
        }),

      removeFromBundle: (connectionId) =>
        set((state) => {
          detachFromBundle(state.project, connectionId);
        }),

      updateBundle: (bundleId, patch) =>
        set((state) => {
          const bundle = state.project.bundles[bundleId];
          if (!bundle) return;
          if (patch.label !== undefined) bundle.label = patch.label.trim() || undefined;
          if (patch.points !== undefined) bundle.points = patch.points;
        }),

      dissolveBundle: (bundleId) =>
        set((state) => {
          const bundle = state.project.bundles[bundleId];
          if (!bundle) return;
          for (const cid of [...bundle.members]) detachFromBundle(state.project, cid);
          delete state.project.bundles[bundleId];
          unlinkChildren(state.project, bundleId);
        }),

      attachWireToWire: (hostId, from, hostPolyline, point) => {
        let created: string | undefined;
        set((state) => {
          const bundleId = bundleFromWire(state.project, hostId, hostPolyline, point);
          if (bundleId) created = joinBundle(state.project, bundleId, from, point);
        });
        return created;
      },

      attachWireToBundle: (bundleId, from, point) => {
        let created: string | undefined;
        set((state) => {
          created = joinBundle(state.project, bundleId, from, point);
        });
        return created;
      },

      linkBundle: (childId, parentId, point) =>
        set((state) => {
          linkBundles(state.project, childId, parentId, point);
        }),

      linkBundleToWire: (childId, hostId, hostPolyline, point) =>
        set((state) => {
          const parentId = bundleFromWire(state.project, hostId, hostPolyline, point);
          if (parentId) linkBundles(state.project, childId, parentId, point);
        }),

      unlinkBundle: (childId) =>
        set((state) => {
          const child = state.project.bundles[childId];
          if (child) child.parent = undefined;
        }),

      addFreeWire: (wire) => {
        const id = newId("wire");
        set((state) => {
          state.project.freeWires[id] = { id, ...wire };
        });
        return id;
      },

      updateFreeWire: (wireId, patch) =>
        set((state) => {
          const wire = state.project.freeWires[wireId];
          if (!wire) return;
          if (patch.kind !== undefined) wire.kind = patch.kind;
          if (patch.points !== undefined) wire.points = patch.points;
          if (patch.lineCount !== undefined)
            wire.lineCount = Math.max(1, Math.floor(patch.lineCount) || 1);
          if (patch.label !== undefined) wire.label = patch.label || undefined;
        }),

      removeFreeWire: (wireId) =>
        set((state) => {
          delete state.project.freeWires[wireId];
        }),

      setNote: (entityId, content) =>
        set((state) => {
          state.project.notes[entityId] = {
            entityId,
            content,
            updatedAt: new Date().toISOString(),
          };
        }),

      addDocumentLink: (entityId, doc) => {
        const id = newId("doc");
        set((state) => {
          const preset = entityId ? state.project.presets[entityId] : undefined;
          state.project.documents[id] = {
            id,
            title: doc.title.trim() || doc.url?.trim() || "Untitled",
            kind: doc.kind,
            scope: preset
              ? "preset"
              : entityId && state.project.devices[entityId]
                ? "instance"
                : "shared",
            presetId: preset?.id,
            url: doc.url?.trim() || undefined,
            file: doc.file,
          };
          if (entityId) state.project.docLinks.push({ documentId: id, entityId });
        });
        return id;
      },

      linkDocument: (documentId, entityId) =>
        set((state) => {
          const doc = state.project.documents[documentId];
          if (!doc || state.project.docLinks.some((l) => l.documentId === documentId && l.entityId === entityId)) return;
          state.project.docLinks.push({ documentId, entityId });
          // A document on more than one thing is shared.
          if (state.project.docLinks.filter((l) => l.documentId === documentId).length > 1) {
            doc.scope = "shared";
            doc.presetId = undefined;
          }
        }),

      deleteDocument: (documentId) =>
        set((state) => {
          delete state.project.documents[documentId];
          delete state.project.notes[documentId];
          state.project.docLinks = state.project.docLinks.filter((l) => l.documentId !== documentId);
        }),

      updateDocument: (documentId, patch) =>
        set((state) => {
          const doc = state.project.documents[documentId];
          if (!doc) return;
          if (patch.title !== undefined && patch.title.trim()) {
            followRename(state.project, documentId, doc.title, patch.title.trim());
            doc.title = patch.title.trim();
          }
          if (patch.url !== undefined) doc.url = patch.url.trim() || undefined;
          if (patch.kind !== undefined) doc.kind = patch.kind;
        }),

      unlinkDocument: (documentId, entityId) =>
        set((state) => {
          state.project.docLinks = state.project.docLinks.filter(
            (l) => !(l.documentId === documentId && l.entityId === entityId),
          );
          // A document nobody links to and nobody wrote in has nothing left to say.
          const stillLinked = state.project.docLinks.some(
            (l) => l.documentId === documentId,
          );
          const hasNote =
            !!state.project.notes[documentId]?.content.trim();
          if (!stillLinked && !hasNote) {
            delete state.project.documents[documentId];
            delete state.project.notes[documentId];
          }
        }),
    })),
    {
      partialize: (state) => ({ project: state.project }),
      // Sets that leave the project alone (save status) must not become undo steps:
      // undoing one looks like nothing happened, and the autosave it triggers adds another.
      equality: (past, current) => past.project === current.project,
      // Past states share structure with the current project, so a long history is cheap.
      limit: 10000,
      handleSet: (handleSet) => {
        let lastPush = 0;
        return (pastState, replace) => {
          const now = Date.now();
          if (now - lastPush < UNDO_COALESCE_MS) return;
          lastPush = now;
          handleSet(pastState, replace);
        };
      },
    },
  ),
);

function meta(project: Project): ProjectMeta {
  return {
    id: project.id,
    name: project.name,
    updatedAt: new Date().toISOString(),
  };
}

function containsPoint(zone: Zone, point: Position) {
  return (
    point.x >= zone.position.x &&
    point.x <= zone.position.x + zone.size.width &&
    point.y >= zone.position.y &&
    point.y <= zone.position.y + zone.size.height
  );
}

function dropConnection(project: Project, connectionId: string) {
  const connection = project.connections[connectionId];
  const bus = connection && isBusRef(connection.to) ? project.buses[connection.to.busId] : undefined;
  const drawn = bus ? busGeometry(project, bus) : undefined;
  detachFromBundle(project, connectionId);
  delete project.connections[connectionId];
  // The bar of a bus with taps can start above its stored position. When the last tap
  // goes, keep the bar where it was drawn instead of snapping back to a short stub.
  if (bus && drawn && busGeometry(project, bus).taps.length === 0) {
    bus.position = { ...bus.position, y: drawn.top };
    bus.length = drawn.height;
  }
}

// Takes a wire out of its bundle; the wire goes back to a direct route and an
// emptied bundle disappears.
function detachFromBundle(project: Project, connectionId: string) {
  const connection = project.connections[connectionId];
  const bundleId = connection?.bundleId;
  if (!bundleId) return;
  connection.bundleId = undefined;
  connection.route = {};
  const bundle = project.bundles[bundleId];
  if (!bundle) return;
  bundle.members = bundle.members.filter((id) => id !== connectionId);
  if (bundle.joins) delete bundle.joins[connectionId];
  if (bundle.members.length === 0) {
    delete project.bundles[bundleId];
    unlinkChildren(project, bundleId);
  }
}

// Trunks that ran into a removed trunk become roots again.
function unlinkChildren(project: Project, bundleId: string) {
  for (const bundle of Object.values(project.bundles)) {
    if (bundle.parent?.bundleId === bundleId) bundle.parent = undefined;
  }
}

// Turns an unbundled wire into a bundle whose trunk is the wire's remaining run from
// `point` to its target stub. The wire keeps the corners before the point as its tail.
// `polyline` is the wire as drawn: [source, stub, ...corners, stub, target].
function bundleFromWire(project: Project, hostId: string, polyline: Position[], point: Position): string | undefined {
  const host = project.connections[hostId];
  if (!host || host.bundleId || polyline.length < 4) return undefined;
  const hit = nearestOnPolyline(polyline, point);
  // Dropping on the target stub leaves no trunk to share.
  if (hit.segment >= polyline.length - 2) return undefined;
  const trunk = polylineFrom(polyline.slice(0, -1), hit);
  if (trunk.length < 2) return undefined;
  const corners = polylineUntil(polyline, hit).slice(2, -1);
  const id = newId("bundle");
  host.bundleId = id;
  host.route = { points: corners };
  project.bundles[id] = { id, points: trunk, members: [hostId] };
  return id;
}

// Adds a wire from `from` to the bundle's shared target, joining the trunk at `point`.
function joinBundle(project: Project, bundleId: string, from: PortRef, point: Position): string | undefined {
  const bundle = project.bundles[bundleId];
  const member = bundle?.members.map((id) => project.connections[id]).find(Boolean);
  if (!bundle || !member) return undefined;
  const existing = Object.values(project.connections).find((c) => JSON.stringify(c.from) === JSON.stringify(from) && JSON.stringify(c.to) === JSON.stringify(member.to));
  if (existing && existing.bundleId && existing.bundleId !== bundleId) return undefined;
  const id = existing?.id ?? newId("conn");
  // Like a device-to-device wire, one line per copy of the source device.
  const lineCount = Math.max(1, project.devices[from.deviceId]?.qty ?? 1);
  if (!existing) project.connections[id] = { id, from, to: member.to, lineCount };
  const connection = project.connections[id];
  connection.bundleId = bundleId;
  connection.route = {};
  if (!bundle.members.includes(id)) bundle.members.push(id);
  const hit = nearestOnPolyline(bundle.points, point);
  bundle.joins = { ...bundle.joins, [id]: { x: Math.round(hit.point.x), y: Math.round(hit.point.y) } };
  return id;
}

function linkBundles(project: Project, childId: string, parentId: string, point: Position) {
  const child = project.bundles[childId];
  const parent = project.bundles[parentId];
  if (!child || !parent || childId === parentId) return;
  // Refuse a loop: the parent must not already run into the child.
  for (let b: WireBundle | undefined = parent; b; b = b.parent ? project.bundles[b.parent.bundleId] : undefined) {
    if (b.id === childId) return;
  }
  const hit = nearestOnPolyline(parent.points, point);
  const at = { x: Math.round(hit.point.x), y: Math.round(hit.point.y) };
  child.parent = { bundleId: parentId, point: at };
  // The child's nearer end lands exactly on the parent trunk.
  const last = child.points.length - 1;
  const gap = (p: Position) => Math.abs(p.x - at.x) + Math.abs(p.y - at.y);
  const end = gap(child.points[0]) <= gap(child.points[last]) ? 0 : last;
  child.points = moveCorner(child.points, end, at);
}

// Stores a project that is new to this machine (created, imported, duplicated) and makes
// it the open one.
type Setter = (fn: (state: ProjectState) => void) => void;
async function adoptProject(
  project: Project,
  set: Setter,
  get: () => ProjectState,
) {
  await flushPendingSave();
  await storage.save(project);
  const index = [...get().projects, withDir(meta(project))];
  await storage.updateIndex(index);
  await setCurrent(project.id, set, get);
  set((state) => {
    state.project = project;
    state.projects = index;
    state.projectDir = storage.dirOf(project.id);
  });
  useProjectStore.temporal.getState().clear();
}

// Opens with this project next launch, and tells the project home when it was last opened.
async function setCurrent(projectId: string, set: Setter, get: () => ProjectState) {
  await storage.setCurrent(projectId);
  // Only the home's "Last opened" depends on this, so a failed write must not keep the
  // project from opening.
  await updatePrefs(set, get, (prefs) => {
    prefs.opened[prefKey(projectId)] = new Date().toISOString();
  }).catch(() => {});
}

// Workspace prefs follow the folder on the desktop, so a copied folder that is given a
// fresh id (see DesktopStorage.claim) cannot take over the original's star.
export function prefKey(projectId: string) {
  return storage.dirOf(projectId) ?? projectId;
}

let prefsWrites: Promise<unknown> = Promise.resolve();

// Undone in memory when it cannot be saved, so the home never shows a star that a restart
// would lose. Updates run one at a time so undoing one cannot also undo a later one.
function updatePrefs(set: Setter, get: () => ProjectState, change: (prefs: WorkspacePrefs) => void) {
  const update = prefsWrites.then(async () => {
    const before = get().prefs;
    set((state) => change(state.prefs));
    try {
      await storage.savePrefs(get().prefs);
    } catch (error) {
      set((state) => {
        state.prefs = before;
      });
      throw error;
    }
  });
  prefsWrites = update.catch(() => {});
  return update;
}

function toggled(keys: string[], key: string, on: boolean) {
  const rest = keys.filter((k) => k !== key);
  return on ? [...rest, key] : rest;
}

function withDir(entry: ProjectMeta): ProjectMeta {
  const dir = storage.dirOf(entry.id);
  return dir ? { ...entry, dir } : entry;
}

// Matches MATICS_EXTENSION in src-tauri/src/storage.rs.
export const MATICS_EXTENSION = "matics";
export const MATICS_FILTER = { name: "Matics project", extensions: [MATICS_EXTENSION] };

// The project with its pictures inline, so a copy can write them into its own folder.
async function exportable(
  project: Project,
  dir: string | null,
): Promise<Project> {
  return dir && isDesktop() ? inlineAssets(project, dir) : project;
}

// Autosave is debounced. The pending project is kept so that replacing state.project
// (switching, creating, deleting) can flush the previous project's save first.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { project: Project; projects: ProjectMeta[] } | null = null;

async function runPendingSave() {
  const pending = pendingSave;
  pendingSave = null;
  if (!pending) return;
  try {
    await storage.save(pending.project);
    const index = pending.projects.map((m) =>
      m.id === pending.project.id
        ? { ...m, name: pending.project.name, updatedAt: new Date().toISOString() }
        : m,
    );
    await storage.updateIndex(index);
    useProjectStore.setState({ saveError: null });
  } catch (error) {
    useProjectStore.setState({ saveError: error instanceof Error ? error.message : String(error) });
  }
}

// Editors that hold back changes (the sketch canvas debounces its scene) register a flush
// here, so replacing the project first writes their edits into the project they came from.
const bufferedEditors = new Set<() => void>();

export function registerBufferedEditor(flush: () => void) {
  bufferedEditors.add(flush);
  return () => {
    bufferedEditors.delete(flush);
  };
}

// Also runs before anything reads the project to copy or export it.
function flushBufferedEditors() {
  for (const flush of bufferedEditors) flush();
}

async function flushPendingSave() {
  flushBufferedEditors();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  await runPendingSave();
}

useProjectStore.subscribe((state, prev) => {
  if (!state.loaded || state.project === prev.project) return;
  if (pendingSave && pendingSave.project.id !== state.project.id) void flushPendingSave();
  pendingSave = { project: state.project, projects: state.projects };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runPendingSave();
  }, 400);
});

export const useProjectDir = () => useProjectStore((s) => s.projectDir);

export const useProject = () => useProjectStore((s) => s.project);
