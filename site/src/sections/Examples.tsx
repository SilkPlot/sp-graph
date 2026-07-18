import { For, type Component } from "solid-js";
import { examples } from "../examples/registry";
import { ExampleCard } from "../components/ExampleCard";

export const Examples: Component = () => (
  <section id="examples" aria-labelledby="examples-h">
    <h2 id="examples-h">Examples</h2>
    <p>
      Each chart below is live, and the source under it is the file that rendered
      it — the same module, read twice, so the code you copy is the code you just
      watched run.
    </p>
    <div class="gallery">
      <For each={examples}>{(ex) => <ExampleCard example={ex} />}</For>
    </div>
  </section>
);
