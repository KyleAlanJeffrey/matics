import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { useProject, useProjectStore } from "@/store/project-store";
import { noteExcerpt, resolveWikiTarget } from "@/model/derived";
import type { Project } from "@/model/types";
import { livePreview, refreshLinks, type LinkTarget } from "./live-preview";

// Link targets are note keys: product, bus or document ids. A placed device can share
// its product's id, so the kind comes from the collection, not entityKind.
function targetInfo(project: Project, id: string) {
  if (project.presets[id]) return { label: project.presets[id].name, kind: "Product" };
  if (project.buses[id]) return { label: project.buses[id].name, kind: "Network" };
  if (project.documents[id]) return { label: project.documents[id].title, kind: "Document" };
  return null;
}

const markdownStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, class: "cm-md-inline-code" },
  { tag: tags.processingInstruction, class: "cm-md-mark" },
  { tag: [tags.url, tags.link], class: "cm-md-url" },
]);

// The one mounted editor, so the outline and open-items links can jump to a line.
let mounted: EditorView | null = null;

export function noteLineTop(line: number): number | null {
  if (!mounted || line < 1 || line > mounted.state.doc.lines) return null;
  const block = mounted.lineBlockAt(mounted.state.doc.line(line).from);
  return mounted.documentTop + block.top;
}

export function revealNoteLine(line: number) {
  const top = noteLineTop(line);
  if (top === null || !mounted) return;
  const scroller = mounted.dom.closest<HTMLElement>("[data-note-scroller]");
  if (scroller) scroller.scrollBy({ top: top - scroller.getBoundingClientRect().top - 96, behavior: "smooth" });
  mounted.dispatch({ selection: { anchor: mounted.state.doc.line(line).to } });
  mounted.focus();
}

function linkTarget(project: Project, target: string): LinkTarget | null {
  const id = resolveWikiTarget(project, target);
  const info = id ? targetInfo(project, id) : null;
  return id && info ? { id, ...info, excerpt: noteExcerpt(project, id) } : null;
}

export function NoteEditor({ entityId }: { entityId: string }) {
  const project = useProject();
  const setNote = useProjectStore((s) => s.setNote);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Extensions are built once per note; they read the latest project through this ref.
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!host.current) return;
    const linkOptions = (context: CompletionContext) => {
      const before = context.matchBefore(/\[\[[^[\]\n|]*/);
      if (!before) return null;
      const current = projectRef.current;
      // Links point at products, buses and documents, never at a placed copy.
      const ids = [...Object.keys(current.presets), ...Object.keys(current.buses), ...Object.keys(current.documents)].filter((id) => id !== entityId);
      const closed = context.state.sliceDoc(context.pos, context.pos + 2) === "]]";
      return {
        from: before.from + 2,
        validFor: /^[^[\]\n|]*$/,
        options: ids.map((id) => {
          const info = targetInfo(current, id)!;
          return { label: info.label, detail: info.kind, apply: closed ? info.label : `${info.label}]]` };
        }),
      };
    };

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: projectRef.current.notes[entityId]?.content ?? "",
        extensions: [
          history(),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownStyle),
          EditorView.lineWrapping,
          EditorState.tabSize.of(4),
          placeholder("Start writing. Type [[ to link a product, network or document."),
          autocompletion({ override: [linkOptions], icons: false }),
          livePreview({ resolve: (target) => linkTarget(projectRef.current, target), openEntity: (id) => navigateRef.current(`/notes/${id}`) }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            // Text pushed in from the store (see below) is already saved.
            if (text !== useProjectStore.getState().project.notes[entityId]?.content) setNote(entityId, text);
          }),
        ],
      }),
    });
    view.current = editor;
    mounted = editor;
    return () => {
      editor.destroy();
      if (mounted === editor) mounted = null;
      view.current = null;
    };
  }, [entityId, setNote]);

  // Renames and new targets change how links read without changing this note's text.
  useEffect(() => {
    view.current?.dispatch({ effects: refreshLinks.of(null) });
  }, [project.presets, project.buses, project.documents, project.notes]);

  // Links elsewhere may be rewritten by a rename; pick that up when this note is not focused.
  const stored = project.notes[entityId]?.content ?? "";
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.hasFocus || editor.state.doc.toString() === stored) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: stored } });
  }, [stored]);

  return <div ref={host} className="note-editor" />;
}
