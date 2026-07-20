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
        <strong>One tab stop, on the charts that have a keyboard model.</strong>{" "}
        Today that is <code>LineChart</code> only — Area, Bar, and Scatter have
        no keyboard composite yet and no focus stop. Where it exists, the
        container holds focus, arrows and Home/End and Page keys move within it,
        and each step is announced through a polite live region. The{" "}
        <code>aria-activedescendant</code> mechanism is available instead, via{" "}
        <code>announce="option"</code>; the two are mutually exclusive, because
        running both says everything twice.
      </li>
      <li>
        <strong>Colour is never the only channel.</strong> Series carry a stroke
        dash pattern alongside colour, reference overlays are dashed and always
        labelled, and the focus ring is a token-driven{" "}
        <code>:focus-visible</code> treatment proven on computed styles. Marker
        shapes exist in <code>@silkplot/theme</code> as a third channel but are
        not yet wired into the shipped marks.
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
