import { createSignal, Show, type Component } from "solid-js";
import type { DocExample } from "../examples/registry";
import { CodeBlock } from "./CodeBlock";

/**
 * One example: the chart it renders, and the source that rendered it.
 *
 * The source is shown collapsed by default so the page reads as a gallery, and
 * it is a real `<button>` driving `hidden` rather than a CSS-only disclosure —
 * a details/summary would be fine too, but this keeps the expanded state
 * queryable from the site's own browser test.
 */
export const ExampleCard: Component<{ example: DocExample }> = (props) => {
  const [open, setOpen] = createSignal(false);
  const panelId = () => `source-${props.example.file}`;

  return (
    <article class="example" data-example={props.example.file}>
      <h3 class="example__title">{props.example.title}</h3>
      <p class="example__blurb">{props.example.blurb}</p>

      <div class="example__chart">
        <props.example.Component />
      </div>

      <button
        type="button"
        class="example__toggle sp-focusable"
        aria-expanded={open()}
        aria-controls={panelId()}
        onClick={() => setOpen(!open())}
      >
        {open() ? "Hide source" : "Show source"}
      </button>

      <div id={panelId()} hidden={!open()}>
        <Show when={open()}>
          <CodeBlock code={props.example.source} label={props.example.file} />
        </Show>
      </div>
    </article>
  );
};
