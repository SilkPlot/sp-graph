import { For, type Component } from "solid-js";
import { LIMITATIONS } from "../content";

export const Limits: Component = () => (
  <section id="limits" aria-labelledby="limits-h">
    <h2 id="limits-h">What this alpha does not do</h2>
    <p>
      Stated plainly so you can plan around it. Nothing here is a surprise
      waiting in a support thread.
    </p>
    <dl class="limits">
      <For each={LIMITATIONS}>
        {(l) => (
          <>
            <dt>{l.headline}</dt>
            <dd>{l.detail}</dd>
          </>
        )}
      </For>
    </dl>
  </section>
);
