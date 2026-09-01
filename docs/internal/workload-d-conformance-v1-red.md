---
{
  "type": "test-evidence",
  "title": "W-D representative-composition red result",
  "description": "Retained failing-browser evidence for the pre-correction W-D tooltip and controlled-legend omissions.",
  "resource": "docs/internal/workload-d-conformance-v1-red.md",
  "tags": ["evidence", "performance", "browser", "conformance"],
  "timestamp": "2026-09-01"
}
---

# W-D representative-composition red result

The real-Chromium conformance seam was run against unchanged base commit
`ddcd70bcb2289d157448657df72a33f7afaad6a9`, before the W-D correction:

```sh
npx vitest run --project perf-harness --maxWorkers=1 --no-file-parallelism test/perf/test/workload-d-conformance.test.tsx
```

The command exited 1. Its one test had two soft failures in a 3,462 ms test body
and 4.55 seconds total:

- `real rendered W-D tooltip: expected null not to be null`
- `one controlled W-D legend button: expected [] to have a length of 1 but got +0`

Every hard fact passed: the `0.62` target mapped to raw source index `53,567`,
instant `2026-01-01T14:52:47.000Z`, and value `210.2`; the active record stayed
on that raw truth while no more than 2,000 points painted. Title, summary, table
reveal, headings, all 86,400 source rows, and the first and target source cells
also passed.

This record retains the expected pre-correction failure. It makes no claim about
the corrected composition.
