import { type EditorState, type Extension, type Range, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { wikiLinks, wikiLinkText } from "@/model/markdown";
import { openExternal } from "@/lib/links";

// Obsidian-style live preview: markdown renders in place, and the markup reappears on
// the line the cursor is on so it can be edited as text.

export interface LinkTarget {
  id: string;
  label: string;
  kind: string;
  excerpt: string;
}

export interface LivePreviewOptions {
  resolve: (target: string) => LinkTarget | null;
  openEntity: (id: string) => void;
}

// Dispatched when link targets may have changed (a rename, a new document), so link
// widgets redraw without the text changing.
export const refreshLinks = StateEffect.define<null>();

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly target: LinkTarget | null,
    readonly open: (id: string) => void,
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return other.text === this.text && other.target?.id === this.target?.id;
  }

  toDOM() {
    const link = document.createElement("a");
    link.className = this.target ? "wiki-link" : "wiki-link wiki-link-missing";
    link.textContent = this.text;
    link.href = this.target ? `#/notes/${this.target.id}` : "#";
    link.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (this.target) this.open(this.target.id);
    });
    link.addEventListener("click", (event) => event.preventDefault());
    return link;
  }

  ignoreEvent() {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-checkbox";
    box.checked = this.checked;
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const at = view.posAtDOM(box);
      const marker = view.state.doc.sliceString(at, at + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = "\u2022";
    return dot;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-md-rule";
    return rule;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });

// Lines touched by a selection show their raw markdown. An unfocused editor shows none.
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

function lineClass(state: EditorState, from: number, to: number, className: string, out: Range<Decoration>[]) {
  const deco = Decoration.line({ class: className });
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos);
    out.push(deco.range(line.from));
    pos = line.to + 1;
  }
}

function build(view: EditorView, options: LivePreviewOptions): DecorationSet {
  const { state } = view;
  const active = activeLines(view);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  // Code spans and blocks keep [[...]] as literal text.
  const codeRanges: [number, number][] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const name = node.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          out.push(Decoration.line({ class: `cm-md-h${heading[1]}` }).range(state.doc.lineAt(node.from).from));
          return;
        }
        if (name === "HeaderMark" && !isActive(node.from)) {
          // The "#" marks and the space after them.
          const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
          out.push(hidden.range(node.from, end));
          return;
        }
        if (name === "FencedCode") {
          codeRanges.push([node.from, node.to]);
          lineClass(state, node.from, node.to, "cm-md-codeblock", out);
          return false;
        }
        if (name === "InlineCode") {
          codeRanges.push([node.from, node.to]);
          if (!isActive(node.from)) {
            const inner = node.node;
            for (let child = inner.firstChild; child; child = child.nextSibling) {
              if (child.name === "CodeMark") out.push(hidden.range(child.from, child.to));
            }
          }
          return false;
        }
        if (name === "Blockquote") {
          lineClass(state, node.from, node.to, "cm-md-quote", out);
          return;
        }
        if (name === "QuoteMark" && !isActive(node.from)) {
          const next = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          out.push(hidden.range(node.from, next));
          return;
        }
        if ((name === "EmphasisMark" || name === "StrikethroughMark") && !isActive(node.from)) {
          out.push(hidden.range(node.from, node.to));
          return;
        }
        if (name === "HorizontalRule" && !isActive(node.from)) {
          out.push(rule.range(node.from, node.to));
          return;
        }
        if (name === "Task") {
          const marker = node.node.getChild("TaskMarker");
          if (!marker) return;
          const checked = /x/i.test(state.doc.sliceString(marker.from, marker.to));
          if (checked) out.push(Decoration.line({ class: "cm-md-done" }).range(state.doc.lineAt(node.from).from));
          out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(marker.from, marker.to));
          return;
        }
        if (name === "ListMark") {
          const line = state.doc.lineAt(node.from);
          // Nested items keep their indent as text; only top-level items hang.
          if (node.from === line.from) out.push(Decoration.line({ class: "cm-md-li" }).range(line.from));
          const item = node.node.parent;
          const isTask = !!item?.getChild("Task");
          const mark = state.doc.sliceString(node.from, node.to);
          const bulletMark = mark === "-" || mark === "*" || mark === "+";
          if (isActive(node.from) || !bulletMark) return;
          // "- " before a checkbox disappears; a plain bullet becomes a dot.
          const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
          out.push(isTask ? hidden.range(node.from, end) : bullet.range(node.from, node.to));
          return;
        }
        if (name === "Link" && !isActive(node.from)) {
          const marks = node.node.getChildren("LinkMark");
          const url = node.node.getChild("URL");
          if (marks.length < 2 || !url) return;
          out.push(hidden.range(marks[0].from, marks[0].to));
          out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": state.doc.sliceString(url.from, url.to) } }).range(marks[0].to, marks[1].from));
          out.push(hidden.range(marks[1].from, node.to));
          return false;
        }
      },
    });
  }

  const inCode = (pos: number) => codeRanges.some(([a, b]) => pos >= a && pos < b);
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    for (const link of wikiLinks(text)) {
      const start = from + link.from;
      const end = from + link.to;
      if (inCode(start)) continue;
      if (isActive(start)) {
        out.push(Decoration.mark({ class: "cm-md-wiki-source" }).range(start, end));
        continue;
      }
      out.push(Decoration.replace({ widget: new WikiLinkWidget(wikiLinkText(link), options.resolve(link.target), options.openEntity) }).range(start, end));
    }
  }

  return Decoration.set(out, true);
}

function wikiPreview(options: LivePreviewOptions) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const link = wikiLinks(line.text).find((l) => pos >= line.from + l.from && pos <= line.from + l.to);
    if (!link) return null;
    const target = options.resolve(link.target);
    if (!target) return null;
    return {
      pos: line.from + link.from,
      end: line.from + link.to,
      above: false,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "wiki-preview";
        const kind = document.createElement("div");
        kind.className = "wiki-preview-kind";
        kind.textContent = target.kind;
        const title = document.createElement("div");
        title.className = "wiki-preview-title";
        title.textContent = target.label;
        const body = document.createElement("div");
        body.className = target.excerpt ? "wiki-preview-body" : "wiki-preview-body wiki-preview-empty";
        body.textContent = target.excerpt || "No notes yet.";
        dom.append(kind, title, body);
        return { dom };
      },
    };
  });
}

// Markdown links in the preview open on click, like Obsidian.
const openLinks = EditorView.domEventHandlers({
  mousedown(event) {
    const link = (event.target as HTMLElement).closest<HTMLElement>(".cm-md-link");
    const href = link?.dataset.href;
    if (!href) return false;
    event.preventDefault();
    openExternal(href);
    return true;
  },
});

export function livePreview(options: LivePreviewOptions): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, options);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks)));
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged || refreshed || syntaxTree(update.startState) !== syntaxTree(update.state)) {
          this.decorations = build(update.view, options);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [plugin, wikiPreview(options), openLinks];
}
