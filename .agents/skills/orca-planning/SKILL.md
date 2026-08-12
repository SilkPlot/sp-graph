---
name: orca-planning
description: >-
  Build and govern the sprint, phase and task hierarchy. Use when turning
  approved intent into planned work, when deciding whether a level may move to
  completed, when a lessons or blocker record must be created and linked, and
  when scope pressure appears mid-sprint. Governs immutability of built-out
  levels, promotion by proof rather than assertion, and the rule that a true
  blocker halts the whole sprint.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-003
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-003 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Planning Model

## 1. Hierarchy

```
sprint -> phase -> task
```

Each level is a document with a **goal** and the detailed information on how
that goal will be reached.

Scaffolding, a `tasks/` folder and a `completed/` folder exist at the levels the
project's profile declares. Every level links to its children, and every child
links back to its parent.

## 2. Promotion rules

Promotion is by proof, never by assertion.

| Level | May move to completed only when |
|-------|----------------------------------|
| Task | Its stated goal has been reached |
| Phase | Every task is completed **and** the phase goal is proven reached |
| Sprint | Every phase is completed **and** the sprint goal is proven reached |

"Proven" is defined by CANON-005. A passing check that could not have failed is
not proof.

## 3. Immutability

Once built out, a sprint, phase or task document is immutable.

The **only** permitted mutation is a Markdown-compatible checkmark. Nothing
more, nothing less.

Two exceptions exist, and only two. Both are additive and both are governed
below: a lessons record, and a blocker record.

## 4. Lessons records

A lessons record is created **during or on completion of** a task, and only if
there were lessons or improvements to capture.

- It is named after the task it belongs to, carrying a lessons marker.
- It must be linked from the task, the phase and the sprint.
- Creating it and adding those links does not violate the immutability rule.

## 5. Blockers and scope control

While a sprint, phase or task is in progress, **no scope creep is permitted**.

When a true blocker is found:

1. Log it as a blocker record, named and linked in the same fashion as a
   lessons record.
2. **The whole sprint halts.** Work does not continue around the blocker.
3. A decision is made on how to clear it, through CANON-004.
4. If the blocker makes the sprint impossible to implement, that decision is
   made then and there rather than deferred.

Nothing is resolved on the fly, as a quick win, as a shortcut, or by looping.

## 6. Relationship to the project

A project supplies, through its profile (CANON-008):

- where sprints, phases and tasks live;
- the naming convention for lessons and blocker records;
- any additional gates it introduces.

A project must not restate this model. It references it and supplies parameters.

## Scope of this skill

This model supplies the structure; the project profile supplies where sprints,
phases and tasks live and how records are named. A project references this model
and parameterizes it - it never restates it.
