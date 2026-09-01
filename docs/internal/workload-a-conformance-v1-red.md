---
{
  "type": "test-evidence",
  "title": "W-A representative-composition red result",
  "description": "Retained failing-browser evidence for the pre-correction W-A tooltip and controlled-legend omissions.",
  "resource": "docs/internal/workload-a-conformance-v1-red.md",
  "tags": ["evidence", "performance", "browser", "conformance"],
  "timestamp": "2026-09-01"
}
---

# W-A representative-composition red result

The real-Chromium conformance seam was run against unchanged base commit
`8399eccbcc5854f19735ee59cd7dc46b63aa7c1a`, before the W-A correction:

```sh
npx vitest run --project perf-harness --maxWorkers=1 --no-file-parallelism test/perf/test/workload-a-conformance.test.tsx
```

The one file ran three tests in one worker: **two failed and one passed**. Total
duration was 3.26 seconds; the test body took 2.20 seconds.

- The missing custom tooltip failed with `expected null not to be null`.
- The missing controlled legend failed with
  `expected [] to have a length of 4 but got +0`.
- The existing public reveal control and source-faithful semantic table passed.

This record retains the expected pre-correction failure. It makes no claim about
the corrected composition.
