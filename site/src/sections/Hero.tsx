import type { Component } from "solid-js";
import { REPO_URL } from "../content";

export const Hero: Component = () => (
  <header class="hero">
    <p class="hero__eyebrow">Alpha</p>
    <h1 class="hero__title">SilkPlot</h1>
    <p class="hero__tagline">
      Fast, fluid data visualization for <a href="https://www.solidjs.com/">Solid</a>.
      <br />
      <strong>D3 computes. Solid renders.</strong>
    </p>
    <p class="hero__body">
      D3's math modules do the arithmetic — scales, tick positions, path
      geometry, spatial indexes — inside pure functions and memos. Every element
      on screen is a Solid element, updated by Solid's fine-grained reactivity.
      No second renderer competes for ownership of the DOM, which is what{" "}
      <code>d3-selection</code>, <code>d3-transition</code>, and{" "}
      <code>d3-axis</code> would be; they are banned from the render path.
    </p>
    <p class="hero__links">
      <a class="button sp-focusable" href="#quickstart">Get started</a>
      <a class="button button--ghost sp-focusable" href={REPO_URL}>Source on GitHub</a>
    </p>
  </header>
);

export const Nav: Component = () => (
  <nav class="nav" aria-label="Sections">
    <ul>
      <li><a href="#install">Install</a></li>
      <li><a href="#quickstart">Quickstart</a></li>
      <li><a href="#examples">Examples</a></li>
      <li><a href="#accessibility">Accessibility</a></li>
      <li><a href="#environments">Environments</a></li>
      <li><a href="#limits">Alpha limits</a></li>
    </ul>
  </nav>
);
