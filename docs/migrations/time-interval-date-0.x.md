# Migration — time interval → `Date` (0.x, breaking)

**This change breaks one thing, deliberately.** SilkPlot's public `TimeInterval`
is now `{ start: Date; end: Date }` everywhere. Before this change, the dashboard's
range prop took epoch milliseconds; now it takes `Date`s, like every other time
value in the library.

It implements [ADR-0017](../decisions/adr-0017-time-at-the-boundary.md). Read that
for the reasoning — in short: the public surface speaks `Date`, the engine speaks
epoch milliseconds, and the old epoch-ms range prop was the one place the internal
representation leaked out.

## What you change

`<Dashboard>` and `<DashboardSection>` callers are affected, and only where an
instant is passed or read. A `<DashboardSection last={…}>` duration is **not**
affected — it is a number of milliseconds elapsed, not a date.

```tsx
// Before — epoch milliseconds.
<Dashboard
  defaultRange={{ start: 1740787200000, end: 1740873600000 }}
  onRangeChange={(range) => save(range.start, range.end)} // numbers
/>

// After — Date instants.
<Dashboard
  defaultRange={{ start: new Date("2026-03-01T00:00:00Z"), end: new Date("2026-03-02T00:00:00Z") }}
  onRangeChange={(range) => save(range.start.getTime(), range.end.getTime())} // Dates
/>
```

The mechanical rule:

| You had | You now pass / read |
|---|---|
| `range={{ start: msA, end: msB }}` | `range={{ start: new Date(msA), end: new Date(msB) }}` |
| `defaultRange={{ start: msA, end: msB }}` | `defaultRange={{ start: new Date(msA), end: new Date(msB) }}` |
| `onRangeChange={(r) => …r.start /* number */}` | `onRangeChange={(r) => …r.start.getTime() /* from Date */}` |
| `dashboardTime.setRange({ start: msA, end: msB })` | `dashboardTime.setRange({ start: new Date(msA), end: new Date(msB) })` |
| `<DashboardSection window={{ start: msA, end: msB }}>` | `<DashboardSection window={{ start: new Date(msA), end: new Date(msB) }}>` |
| `<DashboardSection last={ms} now={msNow}>` | `<DashboardSection last={ms} now={new Date(msNow)}>` (`last` unchanged — it is a duration) |

If your application already holds `Date`s (the common case — you fetched or parsed
them), you now pass them straight through instead of calling `.getTime()` first.
The change removes a conversion as often as it adds one.

## What does not change

- **`<DashboardTimeControl>`** — the built range control is unaffected. It reads
  and writes its `datetime-local` inputs exactly as before; the `Date` conversion
  is internal to it.
- **Series data** — `SeriesDatum.t` was always a `Date`. Nothing about your data
  changes.
- **Behaviour** — the dashboard resolves, clamps, and shares the same interval it
  always did. Only the type at the prop boundary changed.

## Why it is a break and not an addition

A published prop changed the type it accepts, so a caller passing the old type no
longer compiles. That is the point: the compiler shows you every call site to
update, and there is no runtime path where an old epoch-ms number is silently read
as a `Date`. The break is surfaced, not absorbed.

Up: [Decisions](../decisions/adr-0017-time-at-the-boundary.md)
