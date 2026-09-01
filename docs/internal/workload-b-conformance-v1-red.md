---
{
  "type": "test-evidence",
  "title": "W-B representative-composition red result",
  "description": "Retained failing-browser evidence for the pre-correction W-B tooltip and caller-formatting omissions.",
  "resource": "docs/internal/workload-b-conformance-v1-red.md",
  "tags": ["evidence", "performance", "browser", "conformance"],
  "timestamp": "2026-09-01"
}
---

# W-B representative-composition red result

The real-Chromium conformance seam was run against unchanged base commit
`93141f9865c761e31e3b5db5bd9df48c8e60c368`, before the W-B correction:

```sh
npx vitest run --project perf-harness --maxWorkers=1 --no-file-parallelism test/perf/test/workload-b-conformance.test.tsx
```

The command exited 1. The one file ran four tests: **two failed and two passed**.

- The missing custom tooltip failed with `expected null not to be null`.
- The reference-formatting assertion expected
  `["Upper limit: 18,0 kW", "Warning: 16,5 kW", "Maintenance: 2026/01/19, 02:00:00"]`
  but received
  `["Upper limit: 18", "Warning: 16.5", "Maintenance: 2026-01-19"]`.
- The existing controlled legend passed.
- The existing title, summary, public table reveal, and source-faithful cells
  passed.

This record retains the expected pre-correction failure. It makes no claim about
the corrected composition.
