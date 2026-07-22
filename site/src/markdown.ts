/**
 * A markdown renderer for exactly the subset ROADMAP.md uses — headings,
 * paragraphs, flat lists, links, bold, and inline code — and not one feature
 * more.
 *
 * Owned rather than a dependency for the same reason `core` owns its binary
 * search: the consumed surface is tiny, and a full markdown engine would spend
 * bundle budget on tables, footnotes, and HTML passthrough this site must
 * never render. The narrowness is load-bearing and self-enforcing: syntax
 * outside the subset THROWS instead of rendering wrong, so the roadmap test
 * goes red the day someone adds a table to ROADMAP.md, rather than the page
 * quietly showing pipe characters.
 *
 * Input is escaped before any transformation, so the output contains no
 * markup that was not produced here.
 */

const UNSUPPORTED: readonly { name: string; pattern: RegExp }[] = [
  { name: "table", pattern: /^\s*\|/m },
  { name: "blockquote", pattern: /^\s*>/m },
  { name: "fenced code block", pattern: /^```/m },
  { name: "image", pattern: /!\[/ },
  { name: "deep heading (####+)", pattern: /^#{4,}\s/m },
  // `[ \t]`, never `\s`: in multiline mode `\s+` matches ACROSS the newline,
  // so a plain blank line before any list item would false-positive here.
  // Two-space continuations of a wrapped item are legitimate and are merged
  // below; an indented DASH is a genuinely nested list and stays refused.
  { name: "nested list", pattern: /^[ \t]+- /m },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ResolveHref = (href: string) => string;

function inline(text: string, resolveHref: ResolveHref): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_match, label: string, href: string) =>
        `<a href="${resolveHref(href)}">${label}</a>`,
    );
}

/**
 * Render the supported subset to HTML. `demote` shifts every heading down by
 * that many levels (capped at h6), so a document whose own h1 duplicates the
 * hosting section's heading nests correctly instead of fighting it.
 * `resolveHref` maps every link target before it is written — a document
 * whose relative links are repository paths renders 404s on any other host
 * unless the host resolves them to where the files actually are.
 */
export function renderMarkdownSubset(
  markdown: string,
  demote = 0,
  resolveHref: ResolveHref = (href) => href,
): string {
  for (const { name, pattern } of UNSUPPORTED) {
    if (pattern.test(markdown)) {
      throw new Error(
        `markdown subset: ${name} is not supported — extend the renderer and its tests deliberately, or simplify the document`,
      );
    }
  }

  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return blocks
    .map((block) => {
      const heading = block.match(/^(#{1,3})\s+(.*)$/s);
      if (heading?.[1] !== undefined && heading[2] !== undefined) {
        const level = Math.min(heading[1].length + demote, 6);
        return `<h${level}>${inline(heading[2].trim(), resolveHref)}</h${level}>`;
      }
      // A wrapped line continues the line above it (markdown hard-wraps);
      // merge continuations first so list detection sees logical items.
      const lines: string[] = [];
      for (const raw of block.split("\n")) {
        if (/^[ \t]+/.test(raw) && lines.length > 0) {
          lines[lines.length - 1] += ` ${raw.trim()}`;
        } else {
          lines.push(raw);
        }
      }
      if (lines.every((l) => l.startsWith("- "))) {
        const items = lines
          .map((l) => `<li>${inline(l.slice(2).trim(), resolveHref)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(lines.join(" "), resolveHref)}</p>`;
    })
    .join("\n");
}
