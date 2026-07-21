/**
 * DashboardTimeControl — the labelled form surface that selects the dashboard's
 * range.
 *
 * Two native `datetime-local` inputs, because the platform control is already
 * keyboard-operable, already localised, and already understood by assistive
 * technology. A custom picker here would be a large accessibility surface
 * rebuilt worse.
 *
 * ## This is the boundary that refuses an inverted range
 *
 * ADR-0007 §5 makes an inverted interval a caller bug the model will not
 * normalise, and puts the normalisation at the input boundary instead. This is
 * that boundary. A user typing an end before a start is making an ordinary
 * mistake, not writing a bug — so the control holds the draft, reports the
 * problem where they are looking, and does not commit. Silently swapping the two
 * would select a range they did not ask for; committing it would take a
 * development build down with a throw over a typo.
 *
 * ## Known limitation: the browser's zone
 *
 * `datetime-local` has no offset, so the values here are read and written in the
 * BROWSER's local zone while the model works in absolute instants. That is
 * consistent with the library/application boundary — the display zone is the
 * application's — but it means this control cannot present a range in a zone
 * other than the viewer's. An application needing an explicit display zone
 * supplies its own control and calls `setRange` with instants.
 */
import { createMemo, createSignal, createUniqueId, Show, type Component } from "solid-js";
import { useDashboardTime, type DashboardTime } from "./dashboard-time";

export interface DashboardTimeControlProps {
  /** Group label. Default: "Time range". */
  legend?: string;
  /** Label for the start input. Default: "From". */
  startLabel?: string;
  /** Label for the end input. Default: "To". */
  endLabel?: string;
  /**
   * Message shown when the end precedes the start. Default states the problem
   * plainly; supply your own to match the application's voice.
   */
  invalidMessage?: string;
  class?: string;
}

/** Two digits, for the parts of a `datetime-local` value. */
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Epoch milliseconds to a `datetime-local` value, in the browser's zone.
 *
 * Built from the local getters rather than `toISOString().slice(0, 16)`, which
 * is the tempting one-liner and is wrong: `toISOString` is UTC, so it would
 * display an instant shifted by the viewer's offset and write back a different
 * one than it showed.
 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * A `datetime-local` value to epoch milliseconds, in the browser's zone.
 *
 * A date-time string carrying no offset is parsed as local time by
 * specification, which is the pairing that makes this the exact inverse of
 * `toLocalInputValue`. Returns `undefined` for an incomplete or unparseable
 * value, which is the normal state of a partly-typed input.
 */
export function fromLocalInputValue(value: string): number | undefined {
  if (value === "") return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * The draft-versus-committed state behind the two inputs.
 *
 * Pulled out of the component for the same reason `createLineKeyboard` is
 * pulled out of the line chart's body: what the user has typed, whether it is
 * valid, and when it becomes the dashboard's range is one self-contained
 * concern, and the component that remains is about the form's markup — which is
 * what a reader opens it for.
 */
function createRangeDraft(time: DashboardTime) {
  // The draft is what the user has typed; the committed range is what the
  // dashboard holds. They differ exactly while the draft is invalid, which is
  // the state this control exists to make visible instead of resolving.
  const [draftStart, setDraftStart] = createSignal<string | undefined>();
  const [draftEnd, setDraftEnd] = createSignal<string | undefined>();

  const startValue = (): string => draftStart() ?? toLocalInputValue(time.global().start);
  const endValue = (): string => draftEnd() ?? toLocalInputValue(time.global().end);

  return {
    startValue,
    endValue,
    setDraftStart,
    setDraftEnd,
    invalid: createMemo(() => {
      const start = fromLocalInputValue(startValue());
      const end = fromLocalInputValue(endValue());
      if (start === undefined || end === undefined) return false;
      return end < start;
    }),
    /**
     * Commit when the pair is valid, and hold the draft when it is not.
     *
     * Note what is NOT here: a swap, a clamp, or a nudge of the other input to
     * keep the pair ordered. Each would move a value the user did not touch.
     */
    commit: (next: { start?: number; end?: number }): void => {
      const start = next.start ?? fromLocalInputValue(startValue());
      const end = next.end ?? fromLocalInputValue(endValue());
      if (start === undefined || end === undefined || end < start) return;
      // The draft is epoch-ms (its `datetime-local` inputs are); the `Date`
      // crossing is here, at the single commit, per ADR-0017 §3.
      time.setRange({ start: new Date(start), end: new Date(end) });
      setDraftStart(undefined);
      setDraftEnd(undefined);
    },
  };
}

/**
 * One end of the range.
 *
 * The two inputs are not merely similar — they must change TOGETHER. Both carry
 * the same `aria-invalid` and `aria-describedby` wiring pointing at the same
 * error, because the range is invalid as a pair rather than at one end. Two
 * copies would drift the moment one gained an attribute the other did not, and
 * the symptom would be a screen reader announcing the problem on one field and
 * not the other. That is the test the reuse priority sets for when duplication
 * is really one thing.
 */
const RangeInput: Component<{
  label: string;
  value: string;
  invalid: boolean;
  errorId: string;
  onValue: (value: string) => void;
}> = (props) => (
  <label>
    <span>{props.label}</span>
    <input
      type="datetime-local"
      value={props.value}
      aria-invalid={props.invalid ? "true" : undefined}
      aria-describedby={props.invalid ? props.errorId : undefined}
      onInput={(event) => props.onValue(event.currentTarget.value)}
    />
  </label>
);

export const DashboardTimeControl: Component<DashboardTimeControlProps> = (props) => {
  const dashboard = useDashboardTime();
  if (!dashboard) {
    throw new Error(
      "[@silkplot/solid] <DashboardTimeControl> must be rendered inside a <Dashboard>. " +
        "A control with nothing to drive is a form that silently does nothing.",
    );
  }

  const draft = createRangeDraft(dashboard);
  const { startValue, endValue, invalid, commit } = draft;

  // `createUniqueId`, not a random string: two controls on one page must not
  // collide, and `aria-describedby` is an id reference where a duplicate points
  // silently at the wrong element.
  const errorId = createUniqueId();
  const message = (): string =>
    props.invalidMessage ??
    "The end of the range is before its start. The range has not been applied.";

  return (
    <fieldset class={props.class} data-silkplot-time-control="">
      <legend>{props.legend ?? "Time range"}</legend>

      <RangeInput
        label={props.startLabel ?? "From"}
        value={startValue()}
        invalid={invalid()}
        errorId={errorId}
        onValue={(value) => {
          draft.setDraftStart(value);
          commit({ start: fromLocalInputValue(value) });
        }}
      />

      <RangeInput
        label={props.endLabel ?? "To"}
        value={endValue()}
        invalid={invalid()}
        errorId={errorId}
        onValue={(value) => {
          draft.setDraftEnd(value);
          commit({ end: fromLocalInputValue(value) });
        }}
      />

      {/*
        `role="alert"` rather than a plain element: the message appears in
        response to the user's own edit, and a validation failure they cannot see
        is a validation failure they cannot fix. It stays in the tree only while
        invalid so it is not re-announced on every keystroke afterwards.
      */}
      <Show when={invalid()}>
        <p id={errorId} role="alert" data-silkplot-range-error="">
          {message()}
        </p>
      </Show>
    </fieldset>
  );
};
