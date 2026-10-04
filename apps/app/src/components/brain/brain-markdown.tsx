import type { ComponentProps, ReactNode } from "react";
import { Streamdown } from "streamdown";
import { markdownComponents } from "@/lib/markdown";
import "./brain-reader.css";

const BRAIN_LINK = "https://brain.local/note/";
const BRAIN_VAULT = "https://brain.local/vault/";
const BRAIN_ASSET = "https://brain.local/asset/";
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export type BrainProperty = { key: string; values: string[] };

const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");

/** YAML-Frontmatter, so weit sie in Brain-Notizen vorkommt: key: wert, key: [a, b] und Listen. */
export function parseFrontmatter(content: string): { properties: BrainProperty[]; body: string } {
  const text = content.replace(/^\uFEFF/, "");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!fm) return { properties: [], body: text };
  const properties: BrainProperty[] = [];
  let current: BrainProperty | null = null;
  for (const line of fm[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && current) {
      current.values.push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const raw = pair[2].trim();
    const values = raw.startsWith("[")
      ? raw.replace(/^\[|\]$/g, "").split(",").map(unquote).filter(Boolean)
      : raw
        ? [unquote(raw)]
        : [];
    current = { key: pair[1], values };
    properties.push(current);
  }
  return { properties: properties.filter((p) => p.values.length), body: text.slice(fm[0].length) };
}

export function makeResolver(files: string[]) {
  const exact = new Map(files.map((file) => [file.toLowerCase(), file]));
  const byName = new Map<string, string>();
  for (const file of files) {
    const base = file.split("/").pop()!.replace(/\.md$/i, "").toLowerCase();
    if (!byName.has(base)) byName.set(base, file);
  }
  return (target: string) => {
    const lower = target.replace(/\\/g, "/").replace(/^\.\//, "").trim().toLowerCase();
    return (
      exact.get(lower) ??
      exact.get(`${lower}.md`) ??
      exact.get(`vault/${lower}`) ??
      exact.get(`vault/${lower}.md`) ??
      byName.get(lower.split("/").pop()!.replace(/\.md$/, "")) ??
      null
    );
  };
}

const enc = (value: string) => encodeURIComponent(value).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);

/** Obsidian-Syntax in normales Markdown mit internen Links; Code-Blöcke bleiben unberührt. */
function rewriteLinks(markdown: string, resolve: (t: string) => string | null, fromDir: string) {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g, (_all, target: string, label?: string) => {
          const name = target.trim();
          if (/\.(mp4|mov|webm|mkv|mp3|wav|m4a|pdf|html?)$/i.test(name)) {
            const icon = /\.pdf$/i.test(name) ? "📄" : /\.html?$/i.test(name) ? "🌐" : /\.(mp3|wav|m4a)$/i.test(name) ? "🎵" : "🎬";
            return `${icon} *${name.replace(/[*_[\]]/g, " ")}* (nur in Obsidian)`;
          }
          if (IMAGE_EXT.test(name)) return `![${(label && !/^\d+(x\d+)?$/.test(label) ? label : name).replace(/[[\]]/g, "")}](${BRAIN_ASSET}${enc(name)})`;
          const resolved = resolve(name);
          const text = name.split("/").pop()!;
          return resolved ? `↪ [${text}](${BRAIN_LINK}${enc(resolved)})` : `[${text}](${BRAIN_VAULT}${enc(name)})`;
        })
        .replace(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g, (_all, target: string, label?: string) => {
          const name = target.trim();
          const text = (label?.trim() || name.split("/").pop()!).replace(/[[\]]/g, "");
          const resolved = resolve(name);
          return resolved ? `[${text}](${BRAIN_LINK}${enc(resolved)})` : `[${text}](${BRAIN_VAULT}${enc(name)})`;
        })
        .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (all, bang: string, label: string, href: string) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return all;
          let target = href;
          try {
            target = decodeURIComponent(href);
          } catch {}
          if (bang && IMAGE_EXT.test(target)) return `![${label}](${BRAIN_ASSET}${enc(target.replace(/^\.?\//, ""))})`;
          if (!/\.md$/i.test(target.split("#")[0])) return all;
          const joined = (fromDir ? `${fromDir}/` : "") + target.split("#")[0];
          const resolved = resolve(normaliseJoin(joined)) ?? resolve(target.split("#")[0]);
          return resolved ? `[${label}](${BRAIN_LINK}${enc(resolved)})` : `[${label}](${BRAIN_VAULT}${enc(target)})`;
        });
    })
    .join("\n");
}

function normaliseJoin(value: string) {
  const out: string[] = [];
  for (const part of value.split("/")) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

type Segment = { kind: "md"; text: string } | { kind: "callout"; type: string; title: string; fold: string; text: string };

/** `> [!tip] Titel` … bis zur ersten Zeile ohne `>`. */
function splitCallouts(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const lines = markdown.split("\n");
  let buffer: string[] = [];
  let inFence = false;
  const flush = () => {
    if (buffer.length) segments.push({ kind: "md", text: buffer.join("\n") });
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const head = inFence ? null : /^>\s*\[!([A-Za-z-]+)\]([+-]?)\s*(.*)$/.exec(line);
    if (!head) {
      buffer.push(line);
      continue;
    }
    flush();
    const body: string[] = [];
    while (i + 1 < lines.length && /^>/.test(lines[i + 1])) body.push(lines[++i].replace(/^>\s?/, ""));
    segments.push({ kind: "callout", type: head[1].toLowerCase(), fold: head[2], title: head[3], text: body.join("\n") });
  }
  flush();
  return segments;
}

const CALLOUTS: Record<string, { icon: string; tone: string; label: string }> = {
  note: { icon: "📝", tone: "blue", label: "Notiz" },
  info: { icon: "ℹ️", tone: "blue", label: "Info" },
  abstract: { icon: "📋", tone: "blue", label: "Zusammenfassung" },
  summary: { icon: "📋", tone: "blue", label: "Zusammenfassung" },
  todo: { icon: "☑️", tone: "blue", label: "To-do" },
  tip: { icon: "💡", tone: "green", label: "Tipp" },
  hint: { icon: "💡", tone: "green", label: "Tipp" },
  success: { icon: "✅", tone: "green", label: "Erledigt" },
  check: { icon: "✅", tone: "green", label: "Erledigt" },
  done: { icon: "✅", tone: "green", label: "Erledigt" },
  question: { icon: "❓", tone: "yellow", label: "Frage" },
  faq: { icon: "❓", tone: "yellow", label: "Frage" },
  warning: { icon: "⚠️", tone: "yellow", label: "Achtung" },
  caution: { icon: "⚠️", tone: "yellow", label: "Achtung" },
  attention: { icon: "⚠️", tone: "yellow", label: "Achtung" },
  important: { icon: "❗", tone: "purple", label: "Wichtig" },
  failure: { icon: "❌", tone: "red", label: "Fehlgeschlagen" },
  danger: { icon: "⛔", tone: "red", label: "Gefahr" },
  error: { icon: "⛔", tone: "red", label: "Fehler" },
  bug: { icon: "🐞", tone: "red", label: "Bug" },
  example: { icon: "🧪", tone: "purple", label: "Beispiel" },
  quote: { icon: "❝", tone: "gray", label: "Zitat" },
  cite: { icon: "❝", tone: "gray", label: "Zitat" },
};

export function BrainMarkdownBody({
  markdown,
  files,
  fromPath,
  onOpen,
}: {
  markdown: string;
  files: string[];
  fromPath: string;
  onOpen: (path: string) => void;
}) {
  const resolve = makeResolver(files);
  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const components = {
    ...markdownComponents,
    a: (props: ComponentProps<"a">) => {
      const href = props.href ?? "";
      if (href.startsWith(BRAIN_LINK)) {
        const path = decodeURIComponent(href.slice(BRAIN_LINK.length));
        return (
          <button className="brain-link" onClick={() => onOpen(path)} title={path} type="button">
            {props.children}
          </button>
        );
      }
      if (href.startsWith(BRAIN_VAULT)) {
        return (
          <span className="brain-link brain-link-missing" title={`${decodeURIComponent(href.slice(BRAIN_VAULT.length))} – Notiz gibt es (noch) nicht`}>
            {props.children}
          </span>
        );
      }
      return markdownComponents.a(props);
    },
    img: ({ src, alt }: ComponentProps<"img">) => {
      const url = typeof src === "string" ? src : "";
      const real = url.startsWith(BRAIN_ASSET) ? `/api/brain/asset?name=${encodeURIComponent(decodeURIComponent(url.slice(BRAIN_ASSET.length)))}` : url;
      return <img alt={alt ?? ""} loading="lazy" src={real} />;
    },
  };

  const render = (text: string, key: string | number) => (
    <Streamdown components={components} key={key} mode="static">
      {rewriteLinks(text, resolve, fromDir)}
    </Streamdown>
  );

  const parts: ReactNode[] = splitCallouts(markdown).map((segment, index) => {
    if (segment.kind === "md") return segment.text.trim() ? render(segment.text, index) : null;
    const style = CALLOUTS[segment.type] ?? CALLOUTS.note;
    return (
      <div className="brain-callout" data-tone={style.tone} key={index}>
        <span aria-hidden className="brain-callout-icon">
          {style.icon}
        </span>
        <div className="brain-callout-title">{segment.title || style.label}</div>
        {segment.text.trim() ? <div className="brain-callout-body">{render(segment.text, "c")}</div> : null}
      </div>
    );
  });
  return <>{parts}</>;
}
