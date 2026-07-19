/**
 * CSV export, from the control a reader actually presses.
 *
 * The serialiser's own rules are pinned in `core`. What this file proves is the
 * part `core` cannot see: that the control exists, is operable, and produces a
 * file containing the numbers the chart was drawing — not the raw series, and
 * not a differently-derived copy of it.
 *
 * The file is captured by intercepting `URL.createObjectURL`, which is the only
 * honest way to read what the browser was handed. Asserting on the click alone
 * would prove a handler ran; asserting on the chart's data would prove nothing
 * about serialisation. Reading the blob proves the round trip.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { Dashboard } from "@silkplot/solid";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const T0 = Date.UTC(2026, 2, 1);
const DAY = 24 * 60 * 60 * 1000;
const SIZE = { width: 400, height: 200 } as const;

const series = (count: number, from = 0): TimePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    t: new Date(T0 + (from + i) * DAY),
    y: (from + i) * 2,
  }));

/**
 * Capture the file handed to the browser by the next download.
 *
 * `click()` on a detached anchor does not navigate in a test, so nothing is
 * downloaded; the blob is still constructed, which is the artefact under test.
 */
function captureDownload() {
  const created: Blob[] = [];
  const names: string[] = [];
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    created.push(blob as Blob);
    return "blob:captured";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  // The anchor is created and clicked inside the component, so the file name is
  // read off the element rather than guessed from the label.
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === "a") {
      const anchor = el as HTMLAnchorElement;
      const originalClick = anchor.click.bind(anchor);
      anchor.click = () => {
        names.push(anchor.download);
        // Deliberately NOT calling through: a real click would ask the browser
        // to navigate to the blob URL, which the harness has no use for.
        void originalClick;
      };
    }
    return el;
  });

  return {
    names,
    /**
     * The decoded document.
     *
     * NOTE: `Blob.text()` runs a UTF-8 decode, and a UTF-8 decode STRIPS a
     * leading byte-order mark. So the BOM never appears here even when it is
     * present in the file — assert it on `bytes()` instead. Reading this text
     * and concluding the BOM was missing is how somebody removes it from the
     * serialiser and breaks Excel for every non-ASCII label.
     */
    async text(): Promise<string> {
      expect(created).toHaveLength(1);
      return await created[0]!.text();
    },
    /** The raw bytes, which are where the BOM actually is. */
    async bytes(): Promise<Uint8Array> {
      expect(created).toHaveLength(1);
      return new Uint8Array(await created[0]!.arrayBuffer());
    },
    restore(): void {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("The export control", () => {
  it("is a real button with an accessible name that identifies its chart", () => {
    const { container } = render(() => (
      <LineChart title="Daily bookings" data={series(3)} {...SIZE} />
    ));
    const button = container.querySelector<HTMLButtonElement>("[data-silkplot-csv-export]");
    expect(button).not.toBeNull();
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.textContent).toBe("Download CSV");
    // The visible label is short because it sits beside the reveal control; the
    // accessible name carries the chart's name so a reader on a dashboard of
    // several charts can tell which file they are about to take.
    expect(button?.getAttribute("aria-label")).toBe("Download Daily bookings data as CSV");
  });

  it("is offered on a chart with a table and withheld from a decorative one", () => {
    const { container: informative } = render(() => (
      <LineChart title="Daily" data={series(3)} {...SIZE} />
    ));
    expect(informative.querySelector("[data-silkplot-csv-export]")).not.toBeNull();

    const { container: decorative } = render(() => (
      <LineChart decorative data={series(3)} {...SIZE} />
    ));
    // A decorative chart is out of the accessibility tree and exposes no table,
    // so there is nothing for an export to be an export OF.
    expect(decorative.querySelector("[data-silkplot-csv-export]")).toBeNull();
  });

  it("is withheld when the application has opted into presenting the data itself", () => {
    const { container } = render(() => (
      <LineChart title="Daily" data={series(3)} {...SIZE} tableHidden />
    ));
    // `tableHidden` clips the whole alternative. A control left inside it would
    // be a focusable tab stop landing on nothing a sighted keyboard user can
    // see — the same failure the scroll region avoids by not being focusable
    // while collapsed.
    expect(container.querySelector("[data-silkplot-csv-export]")).toBeNull();
  });
});

describe("The exported file", () => {
  it("round-trips the chart's own values, with the generic headings", async () => {
    const capture = captureDownload();
    const { container } = render(() => <LineChart title="Daily" data={series(3)} {...SIZE} />);

    await userEvent.click(
      container.querySelector<HTMLButtonElement>("[data-silkplot-csv-export]")!,
    );

    expect(await capture.text()).toBe(
      "Time,Value\r\n" +
        `${new Date(T0).toISOString()},0\r\n` +
        `${new Date(T0 + DAY).toISOString()},2\r\n` +
        `${new Date(T0 + 2 * DAY).toISOString()},4\r\n`,
    );

    // The BOM, asserted on the BYTES. It is what makes Excel decode UTF-8 rather
    // than the system code page, and its absence is invisible in every other
    // tool — including, as it turns out, in `Blob.text()`.
    expect([...(await capture.bytes()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    capture.restore();
  });

  it("names the file after the chart and the day", async () => {
    const capture = captureDownload();
    const { container } = render(() => (
      <LineChart title="Daily Bookings, Clinic A" data={series(2)} {...SIZE} />
    ));

    await userEvent.click(
      container.querySelector<HTMLButtonElement>("[data-silkplot-csv-export]")!,
    );

    expect(capture.names).toHaveLength(1);
    expect(capture.names[0]).toMatch(/^daily-bookings-clinic-a-\d{4}-\d{2}-\d{2}\.csv$/);
    capture.restore();
  });

  it("exports what the chart is SHOWING, not the whole series", async () => {
    const capture = captureDownload();
    // Ten days of data, a dashboard range covering three of them.
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 2 * DAY, end: T0 + 4 * DAY }}>
        <LineChart title="Daily" data={series(10)} {...SIZE} />
      </Dashboard>
    ));

    await userEvent.click(
      container.querySelector<HTMLButtonElement>("[data-silkplot-csv-export]")!,
    );

    const rows = (await capture.text()).trimEnd().split("\r\n");
    // Header plus three in-range rows. A reader exporting what they are looking
    // at expects what they are looking at; the whole series would be the
    // surprising direction.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toBe(`${new Date(T0 + 2 * DAY).toISOString()},4`);
    expect(rows[3]).toBe(`${new Date(T0 + 4 * DAY).toISOString()},8`);
    capture.restore();
  });

  it("neutralises a formula-shaped label without corrupting it", async () => {
    const capture = captureDownload();
    const { container } = render(() => (
      <LineChart
        title="Daily"
        data={series(1)}
        {...SIZE}
        table={{ columns: ["Label", "Value"], rows: [["=1+1", 3], ["-5", 4]] }}
      />
    ));

    await clickExport(container);

    const text = await capture.text();
    // Guarded, and still legible: the payload survives behind the prefix rather
    // than being stripped or rewritten.
    expect(text).toContain("'=1+1,3");
    expect(text).toContain("'-5,4");
    capture.restore();
  });
});

/** Click the export control. Named for readability at the call site. */
async function clickExport(container: Element): Promise<void> {
  await userEvent.click(
    container.querySelector<HTMLButtonElement>("[data-silkplot-csv-export]")!,
  );
}
