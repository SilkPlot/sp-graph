/**
 * The page, as a list of the sections it is made of.
 *
 * This file was 192 lines of inline JSX until a complexity check said so, and
 * the check was right: a single component holding every section meant the
 * install table and the environments table were the same fourteen lines of
 * markup written twice, and the accessibility-critical parts of that markup —
 * a focusable scroll region, and a name for it — were exactly what would drift
 * between the copies. Both now go through one `DataTable`.
 *
 * What is left here is composition and nothing else, so the reading order of
 * the page is visible at a glance rather than reconstructed by scrolling.
 */
import type { Component } from "solid-js";
import { repoFile } from "./content";
import { Hero, Nav } from "./sections/Hero";
import { Install } from "./sections/Install";
import { Quickstart } from "./sections/Quickstart";
import { Examples } from "./sections/Examples";
import { Accessibility } from "./sections/Accessibility";
import { Environments } from "./sections/Environments";
import { Limits } from "./sections/Limits";
import { Roadmap } from "./sections/Roadmap";
import { Contribute } from "./sections/Contribute";
import { REPO_URL } from "./content";

export const App: Component = () => (
  <>
    {/* The hue field behind the glass — pure decoration, so it is hidden from
        assistive technology and removed entirely when the design language's
        glass degrades to opaque surfaces. */}
    <div class="field" aria-hidden="true">
      <div class="blob blob--violet" />
      <div class="blob blob--teal" />
      <div class="blob blob--cyan" />
    </div>

    {/* First focusable element on the page, and deliberately not hidden with
        `display: none` — that would take it out of the tab order and defeat
        the only thing it is for. */}
    <a class="skip sp-focusable" href="#main">Skip to content</a>

    <Nav />
    <Hero />

    <main id="main">
      <Install />
      <Quickstart />
      <Examples />
      <Accessibility />
      <Environments />
      <Limits />
      <Roadmap />
      <Contribute />
    </main>

    <footer class="footer">
      <p>
        Apache-2.0. Copyright 2026 SilkPlot.{" "}
        <a href={repoFile("LICENSE")}>Licence</a> ·{" "}
        <a href="#roadmap">Roadmap</a> ·{" "}
        <a href={`${REPO_URL}/issues/new/choose`}>Feature requests</a> ·{" "}
        <a href={`${REPO_URL}/discussions`}>Discussions</a>
      </p>
    </footer>
  </>
);
