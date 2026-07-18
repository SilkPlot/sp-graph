import type { Component } from "solid-js";

export interface CodeBlockProps {
  /** The code itself. Always read from a real file — never a literal typed here. */
  code: string;
  /** Filename or shell context, shown as the block's caption. */
  label: string;
  /** Language hint for assistive technology and future highlighting. */
  lang?: string;
}

/**
 * A source listing.
 *
 * `tabindex="0"` on the scroll container is deliberate and is not decoration: a
 * region that scrolls must be reachable by keyboard, or a keyboard-only reader
 * cannot see the right-hand side of a long line. Because it is focusable it also
 * needs an accessible name, which the caption provides via `aria-labelledby`.
 *
 * The focusable element is a `<section>` wrapping the `<pre>`, not the `<pre>`
 * itself. `<pre>` carries no ARIA role, so `aria-labelledby` on it is invalid
 * and a screen reader is free to ignore it — the scroll region would be
 * focusable and anonymous. A named `<section>` is a region by construction.
 */
export const CodeBlock: Component<CodeBlockProps> = (props) => {
  const captionId = `code-${props.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  return (
    <figure class="code">
      <figcaption id={captionId} class="code__caption">
        {props.label}
      </figcaption>
      <section class="code__scroll sp-focusable" tabindex="0" aria-labelledby={captionId}>
        <pre class="code__pre">
          <code data-lang={props.lang ?? "tsx"}>{props.code}</code>
        </pre>
      </section>
    </figure>
  );
};
