/**
 * The roadmap section — a rendering of the repository's ROADMAP.md, never a
 * second copy of it.
 *
 * Same single-source mechanism as the examples: the file is imported raw at
 * build time, so this section and the file cannot disagree. Deleting a
 * section from ROADMAP.md deletes it here; the test asserts exactly that
 * derivation. The file's own h1 is stripped (this section supplies the
 * heading) and the remaining headings are demoted one level to nest under it.
 */
import type { Component } from "solid-js";
import roadmapSource from "../../../ROADMAP.md?raw";
import { renderMarkdownSubset } from "../markdown";
import { repoFile } from "../content";

// Relative links in ROADMAP.md are repository paths; on this host they would
// 404, so they resolve to the file on GitHub. Absolute URLs pass through.
const body = renderMarkdownSubset(
  roadmapSource.replace(/^# .*\n+/, ""),
  1,
  (href) => (/^(https?:)?\/\/|^#/.test(href) ? href : repoFile(href)),
);

export const Roadmap: Component = () => (
  <section id="roadmap" aria-labelledby="roadmap-h">
    <h2 id="roadmap-h">Roadmap</h2>
    <p class="note">
      Rendered from the repository's{" "}
      <a href={repoFile("ROADMAP.md")}>ROADMAP.md</a> — the single public
      source of direction. The{" "}
      <a href="https://github.com/SilkPlot/sp-graph/milestones">milestones</a>{" "}
      and this page both derive from it; none of the three can drift.
    </p>
    <div class="prose" innerHTML={body} />
  </section>
);
