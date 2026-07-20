/**
 * ReferenceOverlay — the drawn half of ADR-0008 §10.
 *
 * ## Where it sits in the paint order, and why that is a decision
 *
 * References draw AFTER the marks, so a threshold stays legible on a chart
 * carrying twenty-two series. Under the marks it would be occluded by exactly
 * the dense operational case the ADR names as its motivating workload, and an
 * overlay you cannot see is the silent failure §10 exists to prevent — it looks
 * exactly like a working chart. The cost is a hairline of data covered by each
 * line, which is accepted and is why the default stroke is 1px.
 *
 * It never draws over the axes, and that is achieved by CLIPPING rather than by
 * ordering. The frame paints its axes before its children, so a mark already
 * paints above an axis; ordering could not put references below one. Instead
 * every line and label is confined to the inner plot rect, which the axes sit
 * outside of — so the guarantee holds regardless of what the frame does next.
 *
 * ## Internal to `@silkplot/charts`, like `CartesianFrame`
 *
 * For the reason recorded there: whether a reference is a line spanning the plot
 * with a label at the edge is an opinion held by this package's composed
 * cartesian charts, not a contract worth freezing in the public primitive layer
 * before a second consumer asks for it.
 */
import { createMemo, createUniqueId, For, Show, type JSX } from "solid-js";
import { packOverlaps, type NormalizedReference } from "@silkplot/core";

/**
 * Presentation defaults. A reference is chrome, and it is separated from the
 * marks and from the crosshair by two NON-COLOUR channels, because the Okabe-Ito
 * categorical palette leaves no hue free to separate it by colour (ADR-0005 §5).
 */
const REFERENCE_STROKE = "var(--sp-color-reference, currentColor)";
const REFERENCE_FONT_SIZE = "var(--sp-font-sm, 11px)";
/** Dashed where the crosshair is solid — the persistent/transient distinction. */
const REFERENCE_DASH = "6 4";
const REFERENCE_STROKE_WIDTH = 1;

/**
 * Type-metric approximations, in px, used only to detect LABEL COLLISIONS.
 *
 * These are an ENGINEERING POLICY, not a measurement, and the distinction is
 * load-bearing: real text metrics need a laid-out DOM, and reading them during
 * render would make the overlay's geometry depend on a measurement pass that
 * itself depends on the geometry. The numbers are deliberately generous, so the
 * failure direction is a label nudged aside that did not strictly need to be —
 * visible, harmless, and self-correcting — rather than two labels drawn on top
 * of each other, which is unreadable and silent.
 */
const LABEL_LINE_HEIGHT = 15;
/** Mean glyph advance as a fraction of font size, for a proportional face. */
const LABEL_GLYPH_RATIO = 0.62;
const LABEL_FONT_PX = 11;
const LABEL_PAD = 4;

export interface ReferenceOverlayProps {
  references: readonly NormalizedReference[];
  /** Pixel position of a reference on its own axis. */
  position: (reference: NormalizedReference) => number;
  innerWidth: number;
  innerHeight: number;
}

/** One reference resolved to pixels, with its label's placement decided. */
interface PlacedReference {
  reference: NormalizedReference;
  /** Pixel position along its axis. */
  at: number;
  /** Where the label's text anchor goes. */
  labelX: number;
  labelY: number;
  /** False when no lane fitted inside the plot — see `place`. */
  labelDrawn: boolean;
}

const estimateWidth = (label: string): number =>
  label.length * LABEL_GLYPH_RATIO * LABEL_FONT_PX + LABEL_PAD * 2;

/**
 * Resolve positions and stack colliding labels into lanes.
 *
 * ## The collision fallback, stated because the phase requires it to be
 *
 * Labels for VALUE references sit at the right edge and collide vertically;
 * labels for TIME references sit at the top and collide horizontally. Either way
 * the colliding axis is packed with `packOverlaps`, which is deterministic and
 * already this estate's answer for lane assignment, and each lane is offset
 * along the OTHER axis so the stack grows away from the plot edge.
 *
 * **When a lane would land outside the plot, the label is not drawn.** It is not
 * shrunk, not truncated, and not allowed to spill over an axis. That is only
 * defensible because the reference's meaning does not live in this label alone:
 * every reference is also an entry in the chart's accessible reference list,
 * which is unconditional and is not a fallback. A label dropped here costs a
 * sighted reader a glance at the list; a label drawn over an axis would cost
 * every reader the axis.
 *
 * `key` is the reference id. `packOverlaps` throws on a duplicate key, which is
 * safe here rather than a hazard: `normalizeReferences` has already made ids
 * unique on both its development and its production path.
 */
function place(
  references: readonly NormalizedReference[],
  position: (reference: NormalizedReference) => number,
  innerWidth: number,
  innerHeight: number,
): readonly PlacedReference[] {
  const limit = { value: innerHeight, time: innerWidth } as const;

  // Out-of-range references are dropped BEFORE packing: a line with no pixel
  // inside the plot has no label to place, and letting it occupy a lane would
  // push a visible reference's label aside for the sake of an invisible one.
  const visible = references
    .map((reference) => ({ reference, at: position(reference) }))
    .filter(
      ({ reference, at }) =>
        Number.isFinite(at) && at >= 0 && at <= limit[reference.axis],
    );

  const packed = packOverlaps(
    visible.map(({ reference, at }) => {
      const span =
        reference.axis === "value" ? LABEL_LINE_HEIGHT : estimateWidth(reference.label);
      return { start: at - span / 2, end: at + span / 2, reference, at };
    }),
    { key: (item) => item.reference.id },
  );

  return packed.map(({ item, lane }) => {
    if (item.reference.axis === "value") {
      // Horizontal line, label at the right edge; lanes step LEFTWARD.
      const width = estimateWidth(item.reference.label);
      const labelX = innerWidth - LABEL_PAD - lane * width;
      return {
        reference: item.reference,
        at: item.at,
        labelX,
        labelY: item.at - LABEL_PAD,
        labelDrawn: labelX - width >= 0,
      };
    }
    // Vertical line, label at the top; lanes step DOWNWARD.
    const labelY = LABEL_PAD + LABEL_LINE_HEIGHT * (lane + 1);
    return {
      reference: item.reference,
      at: item.at,
      labelX: item.at + LABEL_PAD,
      labelY,
      labelDrawn: labelY <= innerHeight,
    };
  });
}

export function ReferenceOverlay(props: ReferenceOverlayProps): JSX.Element {
  const placed = createMemo(() =>
    place(props.references, props.position, props.innerWidth, props.innerHeight),
  );

  // One clip path per overlay INSTANCE. `createUniqueId` for the same reason the
  // semantics ids use it: two charts on one page must not share an id, and an
  // SVG id is document-global, so a clip keyed on anything derivable from the
  // props — the dimensions, say — would be shared by two charts of the same size
  // and would also churn on every resize. It is sequential rather than random,
  // so the rendered markup stays deterministic for the visual baselines.
  const clipId = `sp-ref-clip-${createUniqueId()}`;

  return (
    <Show when={props.innerWidth > 0 && props.innerHeight > 0}>
      <g data-silkplot-references="">
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={props.innerWidth} height={props.innerHeight} />
          </clipPath>
        </defs>
        <g clip-path={`url(#${clipId})`}>
          <For each={placed()}>
            {(p) => (
              <g data-silkplot-reference={p.reference.id}>
                {/*
                  One `<line>` for both axes, with the span computed. Two
                  branches would be the same element written twice and would
                  drift the moment a stroke or dash default changed on one.
                */}
                <line
                  x1={p.reference.axis === "value" ? 0 : p.at}
                  y1={p.reference.axis === "value" ? p.at : 0}
                  x2={p.reference.axis === "value" ? props.innerWidth : p.at}
                  y2={p.reference.axis === "value" ? p.at : props.innerHeight}
                  stroke={p.reference.style.stroke ?? REFERENCE_STROKE}
                  stroke-width={p.reference.style.strokeWidth ?? REFERENCE_STROKE_WIDTH}
                  // `.join(" ")` because `SeriesStyle.dash` is a number array,
                  // exactly as `resolveSeriesStyle` serialises it. The default
                  // is a string literal rather than an array so the dashed-vs-
                  // solid distinction against the crosshair is stated once here.
                  stroke-dasharray={p.reference.style.dash?.join(" ") ?? REFERENCE_DASH}
                  // `butt`, not `round`: a round cap extends each dash by half a
                  // stroke width at both ends, closing a fine pattern into a
                  // solid line. Same reasoning as `StrokedLine`.
                  stroke-linecap="butt"
                />
                <Show when={p.labelDrawn}>
                  <text
                    x={p.labelX}
                    y={p.labelY}
                    text-anchor={p.reference.axis === "value" ? "end" : "start"}
                    font-size={REFERENCE_FONT_SIZE}
                    fill={REFERENCE_STROKE}
                    data-silkplot-reference-label={p.reference.id}
                  >
                    {p.reference.label}
                  </text>
                </Show>
              </g>
            )}
          </For>
        </g>
      </g>
    </Show>
  );
}
