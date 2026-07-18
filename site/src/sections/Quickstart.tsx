import type { Component } from "solid-js";
import quickstartSource from "../quickstart/app.tsx?raw";
import { CodeBlock } from "../components/CodeBlock";

export const Quickstart: Component = () => (
  <section id="quickstart" aria-labelledby="quickstart-h">
    <h2 id="quickstart-h">Five-minute quickstart</h2>
    <p>
      Three steps: inject the tokens, bring your data, render a chart. This
      listing is not a transcription — it is the exact contents of a file in this
      site's own source, typechecked against the public exports on every CI run,
      and copied into the release gate's consumer fixture so it is proven against
      the packed tarballs rather than against this repository. If it ever stopped
      compiling, the build would go red before it could mislead you.
    </p>
    <CodeBlock code={quickstartSource} label="src/main.tsx" />
    <p class="note">
      <code>title</code> is not optional on an informative chart. The props are a
      discriminated union in which an unnamed informative chart is not
      representable, so leaving it out is a compile error rather than a runtime
      warning that reaches production.
    </p>
  </section>
);
