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
import { Contribute } from "./sections/Contribute";

export const App: Component = () => (
  <>
    {/* First focusable element on the page, and deliberately not hidden with
        `display: none` — that would take it out of the tab order and defeat
        the only thing it is for. */}
    <a class="skip sp-focusable" href="#main">Skip to content</a>

    <Hero />
    <Nav />

    <main id="main">
      <Install />
      <Quickstart />
      <Examples />
      <Accessibility />
      <Environments />
      <Limits />
      <Contribute />
    </main>

    <footer class="footer">
      <p>
        Apache-2.0. Copyright 2026 SilkPlot.{" "}
        <a href={repoFile("LICENSE")}>Licence</a>.
      </p>
    </footer>
  </>
);
