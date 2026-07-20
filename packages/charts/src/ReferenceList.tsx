/**
 * ReferenceList — the semantic half of ADR-0008 §10.
 *
 * A reference's meaning must not live only in a drawn label. Two independent
 * reasons, and the second is the one that makes the overlay's collision
 * behaviour defensible at all:
 *
 *   1. **A drawn label is not in the accessibility tree in any useful form.**
 *      SVG `<text>` inside a `role="img"` graphic is not explorable; the chart
 *      exposes its content through the description and the data table (ADR-0005
 *      §3), and a threshold absent from both is a threshold a screen-reader user
 *      cannot learn about at all.
 *   2. **The overlay drops a label it cannot place** rather than truncating it
 *      or spilling it over an axis. That is only an acceptable fallback because
 *      this list is unconditional — it is not itself a fallback, and it does not
 *      collide, so it is where the meaning actually lives.
 *
 * Rendered for EVERYONE rather than screen-reader-only, per the accessibility
 * contract's position on the data alternative: a hidden structure is a
 * last-resort progressive enhancement, and sighted readers benefit from an exact
 * list of thresholds too.
 *
 * ## Wording comes from the AXIS formatters, and no new prop
 *
 * A reference sits on an axis whose ticks the caller already words (ADR-0010).
 * A threshold at 95 on an axis reading "95 kW" must read "95 kW" here, so this
 * takes `xTickFormat` and `yTickFormat` rather than introducing a third
 * formatter prop that could disagree with the axis the line is drawn against.
 * With no formatter it falls back to §9's generic-and-honest defaults: an
 * unadorned number, and an ISO 8601 instant.
 */
import { For, Show, type JSX } from "solid-js";
import type { NormalizedReference } from "@silkplot/core";

export interface ReferenceListProps {
  references: readonly NormalizedReference[];
  /** Heading text. Generic by default — domain wording is the application's. */
  heading?: string;
  xTickFormat?: (value: Date) => string;
  yTickFormat?: (value: number) => string;
  class?: string;
}

export const DEFAULT_REFERENCE_HEADING = "Reference values";

/** One reference as the text a reader gets, on either axis. */
export function referenceText(
  reference: NormalizedReference,
  format: Pick<ReferenceListProps, "xTickFormat" | "yTickFormat">,
): string {
  if (reference.axis === "time") {
    const at = new Date(reference.at);
    return `${reference.label}: ${format.xTickFormat?.(at) ?? at.toISOString()}`;
  }
  return `${reference.label}: ${format.yTickFormat?.(reference.at) ?? String(reference.at)}`;
}

export function ReferenceList(props: ReferenceListProps): JSX.Element {
  return (
    <Show when={props.references.length > 0}>
      <div class={props.class} data-silkplot-reference-list="">
        {/*
          A real list with a real heading, not a paragraph of comma-separated
          text: the count is then available to a screen reader up front, and each
          threshold is a separately-navigable item.
        */}
        <p data-silkplot-reference-heading="">
          {props.heading ?? DEFAULT_REFERENCE_HEADING}
        </p>
        <ul>
          <For each={props.references}>
            {(reference) => (
              <li data-silkplot-reference-item={reference.id}>
                {referenceText(reference, props)}
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
}
