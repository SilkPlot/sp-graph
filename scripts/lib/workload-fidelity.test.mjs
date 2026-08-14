import assert from "node:assert/strict";
import test from "node:test";
import {
  w1DashboardDeck,
  w1DenseSeries,
} from "../../packages/charts/test/workload-fixtures.ts";
import {
  selectVisiblePathologicalSeries,
  summarizeDashboardFixture,
} from "../../test/perf/app/workload-fidelity.ts";

test("W-B mutates only the currently visible series in production order", () => {
  const series = w1DenseSeries();
  const selected = selectVisiblePathologicalSeries(series, [
    series[17].id,
    series[3].id,
    series[9].id,
  ]);

  assert.deepEqual(
    selected.map((candidate) => candidate.id),
    [series[3].id, series[9].id, series[17].id],
  );
  assert.equal(selected.length, 3);
  assert.notEqual(selected.length, series.length);
});

test("W-C reports the points actually rendered by its mixed-family deck", () => {
  const deck = w1DashboardDeck(48);
  const summary = summarizeDashboardFixture(deck);

  assert.equal(summary.renderedPoints, 525);
  assert.notEqual(
    summary.renderedPoints,
    deck.reduce((total, panel) => total + panel.time.length, 0),
  );
});

test("W-C mutates only the first driven time-series chart", () => {
  const deck = w1DashboardDeck(48);
  const summary = summarizeDashboardFixture(deck);

  assert.equal(summary.pathologicalSeries.length, 1);
  assert.equal(summary.pathologicalSeries[0].id, deck[0].id);
  assert.strictEqual(summary.pathologicalSeries[0].data, deck[0].time);
  assert.equal(summary.pathologicalSeries[0].data.length, 12);
  assert.equal(deck[0].family, "line");
  assert.equal(
    deck
      .filter((panel) => panel.family === "bar")
      .some((panel) => panel.id === summary.pathologicalSeries[0].id),
    false,
  );
});
