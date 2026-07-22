/**
 * The hero and the site nav.
 *
 * The hero leads with two proofs instead of adjectives: the wordmark (itself
 * eight chart families), and a live chart rendered by the library on the page
 * — not a screenshot, per the site's cannot-lie discipline. The wordmark sits
 * INSIDE the h1 so the page keeps its heading (accessible name from the
 * image's alt); swapping the h1's text for a bare <img> would have traded the
 * page's document outline for a picture. The under-construction statement is
 * in the hero deliberately: honesty is the brand, so it belongs on the first
 * screen, specific and unhedged.
 *
 * The nav is a sticky glass bar — the design language's material — with the
 * S-spline mark, the section links, and the scheme switcher.
 */
import type { Component } from "solid-js";
import logoUrl from "../../../brand/logo.svg?url";
import markUrl from "../../../brand/mark.svg?url";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { REPO_URL, repoFile } from "../content";
import LiveLineChart from "../examples/01-line";

const FEATURE_REQUEST_URL = `${REPO_URL}/issues/new/choose`;

export const Hero: Component = () => (
  <header class="hero">
    <div class="hero__copy">
      <p class="hero__eyebrow">Alpha · the 0.3.0-next line</p>
      <h1 class="hero__title">
        <img src={logoUrl} alt="SilkPlot" width="440" height="126" />
      </h1>
      <p class="hero__tagline">
        Fast, fluid data visualization for{" "}
        <a href="https://www.solidjs.com/">Solid</a>.{" "}
        <strong>D3 computes. Solid renders.</strong>
      </p>
      <p class="hero__body">
        D3's math modules do the arithmetic — scales, tick positions, path
        geometry, spatial indexes — inside pure functions and memos. Every
        element on screen is a Solid element, updated by Solid's fine-grained
        reactivity. No second renderer competes for ownership of the DOM,
        which is what <code>d3-selection</code>, <code>d3-transition</code>,
        and <code>d3-axis</code> would be; they are banned from the render
        path.
      </p>
      <p class="hero__links">
        <a class="button sp-focusable" href="#quickstart">Get started</a>
        <a class="button button--ghost sp-focusable" href="#roadmap">Roadmap</a>
        <a class="button button--ghost sp-focusable" href={REPO_URL}>GitHub</a>
      </p>
    </div>

    <div class="hero__demo panel">
      <LiveLineChart />
      <p class="hero__demo-caption">
        This chart is live — rendered by the library on this page, not a
        screenshot.
      </p>
    </div>

    <aside class="construction panel" aria-labelledby="construction-h">
      <h2 id="construction-h">Under construction — plainly</h2>
      <ul>
        <li>
          Alpha packages on the <code>0.3.0-next</code> line, installed with{" "}
          <code>@next</code>. This is 0.x: a minor bump may contain breaking
          changes, and every breaking change ships with a migration note.
        </li>
        <li>
          <strong>No assistive technology has been verified yet.</strong> The
          accessibility contract is implemented and gated in CI; screen-reader
          verification is still ahead, and{" "}
          <a href={repoFile("docs/accessibility.md")}>
            the accessibility guide
          </a>{" "}
          says exactly what is and is not claimed.
        </li>
        <li>
          No performance number is claimed anywhere on this site — none has
          been measured under the project's frozen protocol yet. Fast and
          smooth is the bar the code is built against, not a benchmark result.
        </li>
      </ul>
      <p>
        Missing a capability you need?{" "}
        <a href={FEATURE_REQUEST_URL}>Ask for it</a> — the{" "}
        <a href="#roadmap">roadmap</a> shows what is already planned.
      </p>
    </aside>
  </header>
);

export const Nav: Component = () => (
  <nav class="nav" aria-label="Sections">
    <a class="nav__brand" href="#main" aria-label="SilkPlot — skip to content">
      <img src={markUrl} alt="" width="22" height="22" />
      <span>SilkPlot</span>
    </a>
    <ul>
      <li><a href="#install">Install</a></li>
      <li><a href="#quickstart">Quickstart</a></li>
      <li><a href="#examples">Examples</a></li>
      <li><a href="#accessibility">Accessibility</a></li>
      <li><a href="#limits">Alpha limits</a></li>
      <li><a href="#roadmap">Roadmap</a></li>
    </ul>
    <ThemeSwitcher />
  </nav>
);
