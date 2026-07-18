import type { Component } from "solid-js";
import { repoFile } from "../content";

export const Accessibility: Component = () => (
  <section id="accessibility" aria-labelledby="accessibility-h">
    <h2 id="accessibility-h">Accessibility</h2>
    <p>
      A chart is a picture of information, so the information has to exist
      somewhere a picture is not required. SilkPlot builds that in rather than
      offering it: optional accessibility ships as absent accessibility.
    </p>
    <ul class="facts">
      <li>
        <strong>Naming is enforced by the type system.</strong> Informative is
        the default and decorative is an explicit opt-out, so a chart cannot
        reach the accessibility tree unnamed.
      </li>
      <li>
        <strong>A real data table ships with every informative chart,</strong>{" "}
        derived from the same data the marks draw and related by{" "}
        <code>aria-details</code>. That is what makes hiding the axes from
        assistive technology defensible.
      </li>
      <li>
        <strong>One tab stop per chart.</strong> The container holds focus and
        references the active point with <code>aria-activedescendant</code>.
        Arrows, Home/End, and Page keys move within it. Pointer and keyboard
        write one shared active-datum state, so the crosshair and the
        announcement cannot disagree.
      </li>
      <li>
        <strong>Colour is never the only channel.</strong> Series carry dash
        patterns and marker shapes alongside colour, and the focus ring is a
        token-driven <code>:focus-visible</code> treatment proven on computed
        styles.
      </li>
    </ul>
    <p class="callout callout--warn">
      <strong>What is missing is corroboration, not implementation.</strong> No
      screen reader has been run against this library — no NVDA, JAWS,
      VoiceOver, Orca, Narrator, or TalkBack, not even informally. Automated
      evidence is extensive and it is not a substitute. No WCAG conformance is
      claimed at any level.
    </p>
    <p>
      The author-facing guide — what the library gives you, and what remains
      yours to supply — is{" "}
      <a href={repoFile("docs/accessibility.md")}>docs/accessibility.md</a>.
    </p>
  </section>
);
