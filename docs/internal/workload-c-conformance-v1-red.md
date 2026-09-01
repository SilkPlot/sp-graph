---
{
  "type": "test-evidence",
  "title": "W-C representative-composition red result",
  "description": "Retained failing-browser evidence for the pre-correction W-C tooltip and reactive-semantics omissions.",
  "resource": "docs/internal/workload-c-conformance-v1-red.md",
  "tags": ["evidence", "performance", "browser", "conformance"],
  "timestamp": "2026-09-01"
}
---

# W-C representative-composition red result

The real-Chromium conformance seam was run against unchanged base commit
`71092d4de0837b5663483dc2bc0d07ce1a3c2969`, before the W-C correction:

```sh
npx vitest run --project perf-harness --maxWorkers=1 --no-file-parallelism test/perf/test/workload-c-conformance.test.tsx
```

The command exited 1. The one file ran five tests in 35.02 seconds: **four
failed and one passed**; the test body took 33.97 seconds.

- The line tooltip was absent: `expected null not to be null`.
- The area tooltip was absent: `expected null not to be null`.
- The ranked-bar tooltip was absent: `expected null not to be null`.
- After the real narrow resize, the title received `Panel 1` instead of
  `Panel 1 — narrow`, and the summary received
  `Panel 1 of 48 in the mounted deck.` instead of
  `Panel 1 of 48 in the mounted deck, using the narrow layout.`.
- The existing forty-eight-table semantic and source-correspondence check
  passed.

This record retains the expected pre-correction failure. It makes no claim about
the corrected composition.
