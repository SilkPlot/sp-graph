---
{
  "type": "test-evidence",
  "title": "Left-axis label fit red result",
  "description": "Retained failing-browser evidence that every performance workload page clipped its caller-formatted y-axis tick labels on the constant 40px default left margin before the pages reserved their own.",
  "resource": "docs/internal/left-axis-fit-red.md",
  "tags": ["evidence", "performance", "browser", "conformance", "axis"],
  "timestamp": "2026-09-04"
}
---

# Left-axis label fit red result

On a headed inspection of the workload pages on 2026-09-04, every y-axis tick
on W-A and W-D read `0,0 °C`. The labels were painted correctly; they were
right-aligned 10 px left of the plot origin on the library's constant 40 px
default left margin, so every leading digit fell off the canvas edge.

A conformance assertion was written first and run against the unchanged
pages, in real Chromium, before any page reserved a margin:

```sh
npx vitest run --project perf-harness --maxWorkers=1 --no-file-parallelism \
  test/perf/test/workload-a-conformance.test.tsx \
  test/perf/test/workload-b-conformance.test.tsx \
  test/perf/test/workload-c-conformance.test.tsx \
  test/perf/test/workload-d-conformance.test.tsx
```

All four new fit tests failed with the retained message
`left-axis tick label does not fit inside the margin`; the thirteen existing
tests passed. The assertion hooks `CanvasRenderingContext2D.fillText`, so the
widths are those of the painted font and the room is the plot origin minus
the label's anchor offset:

| Page | Labels painted | Clipped | Widest label | Width | Room |
|---|---:|---:|---|---:|---:|
| W-A | 8 | 6 | `20,0 °C` | 33.7 px | 30.0 px |
| W-B | 10 | 10 | `-20,0 kW` | 41.5 px | 30.0 px |
| W-C | 130 | 130 | `10,0 units` | 43.4 px | 30.0 px |
| W-D | 12 | 10 | `100,0 °C` | 39.2 px | 30.0 px |

The correction follows ADR-0013: the caller who owns the formatter reserves
the room its labels need through `margins.left`, and the library does not
measure the default path. W-A, W-B, and W-D reserve 64 px; W-C's three panel
families reserve 72 px. The mutation suite keeps the pre-correction
composition as its eighth named mutation and retains the exact failure.

This record retains the expected pre-correction failure. It makes no claim
about timing.
