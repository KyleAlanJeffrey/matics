// Notes are Obsidian-style markdown. Wiki links are written [[Name]] or [[Name|shown text]]
// and name a product, bus or document; model/derived.ts resolves the name to an entity.

export interface WikiLink {
  from: number;
  to: number;
  target: string;
  alias?: string;
}

const WIKI_LINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

export function wikiLinks(text: string): WikiLink[] {
  return Array.from(text.matchAll(WIKI_LINK), (m) => ({
    from: m.index,
    to: m.index + m[0].length,
    target: m[1].trim(),
    alias: m[2]?.trim(),
  }));
}

export function wikiLinkText(link: WikiLink) {
  return link.alias || link.target;
}

// Points [[old]] and [[old|alias]] at `next`, keeping any alias. Used when a product,
// bus or document is renamed so existing links follow it.
export function renameWikiLinks(markdown: string, old: string, next: string): string {
  const wanted = old.trim().toLowerCase();
  if (!wanted || old === next) return markdown;
  return markdown.replace(WIKI_LINK, (whole, target: string, alias?: string) =>
    target.trim().toLowerCase() === wanted ? `[[${next}${alias ? `|${alias}` : ""}]]` : whole,
  );
}

export type LineKind = "heading" | "paragraph" | "bullet" | "numbered" | "check" | "quote" | "code" | "rule";

export interface MarkdownLine {
  // 1-based, as editors count them.
  line: number;
  kind: LineKind;
  depth: number;
  // Content without the line's markdown markers. Inline markup is left in; see plainText.
  text: string;
  level?: number;
  checked?: boolean;
}

// A line-level reading of the note: enough for outlines, open items, previews and the
// printed report. Blank lines are dropped; a fenced code block becomes one "code" line.
export function markdownLines(markdown: string): MarkdownLine[] {
  const out: MarkdownLine[] = [];
  const rows = markdown.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    // CommonMark fences: up to three spaces of indent; the closing fence repeats the
    // opener's character at least as many times, with nothing after it.
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      const body: string[] = [];
      const start = i;
      const close = new RegExp(`^ {0,3}\\${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (++i < rows.length && !close.test(rows[i])) body.push(rows[i]);
      out.push({ line: start + 1, kind: "code", depth: 0, text: body.join("\n") });
      continue;
    }
    if (!raw.trim()) continue;
    const indent = /^[\t ]*/.exec(raw)![0];
    const depth = (indent.match(/\t/g)?.length ?? 0) + Math.floor((indent.match(/ /g)?.length ?? 0) / 2);
    const body = raw.slice(indent.length);
    const line = i + 1;
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(body))) out.push({ line, kind: "heading", depth: 0, level: m[1].length, text: m[2] });
    else if (/^([-*_])(\s*\1){2,}\s*$/.test(body)) out.push({ line, kind: "rule", depth: 0, text: "" });
    else if ((m = /^[-*+]\s+\[([ xX])\]\s?(.*)$/.exec(body))) out.push({ line, kind: "check", depth, checked: m[1] !== " ", text: m[2] });
    else if ((m = /^[-*+]\s+(.*)$/.exec(body))) out.push({ line, kind: "bullet", depth, text: m[1] });
    else if ((m = /^\d+[.)]\s+(.*)$/.exec(body))) out.push({ line, kind: "numbered", depth, text: m[1] });
    else if ((m = /^>\s?(.*)$/.exec(body))) out.push({ line, kind: "quote", depth: 0, text: m[1] });
    else out.push({ line, kind: "paragraph", depth, text: body });
  }
  return out;
}

// Inline markup removed: links become their text, emphasis and code marks disappear.
// Code spans keep their contents verbatim, and underscores only mark emphasis at word
// boundaries, so identifiers like Front_Encoders survive.
export function plainText(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part.slice(1, -1) : stripInline(part)))
    .join("")
    .trim();
}

function stripInline(text: string): string {
  return text
    .replace(WIKI_LINK, (_whole, target: string, alias?: string) => (alias || target).trim())
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|~~|==)(.+?)\1/g, "$2")
    .replace(/(?<![\w_])__(?!\s)(.+?)(?<!\s)__(?![\w_])/g, "$1")
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, "$1")
    .replace(/(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g, "$1");
}

export function markdownOutline(markdown: string) {
  return markdownLines(markdown)
    .filter((l) => l.kind === "heading")
    .map((l) => ({ line: l.line, level: l.level ?? 1, text: plainText(l.text) }))
    .filter((h) => h.text.length > 0);
}

export function markdownOpenItems(markdown: string) {
  return markdownLines(markdown)
    .filter((l) => l.kind === "check" && !l.checked)
    .map((l) => ({ line: l.line, text: plainText(l.text) }))
    .filter((item) => item.text.length > 0);
}

