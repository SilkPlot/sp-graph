---
name: orca-dry-principle
description: >-
  Apply the DRY principle as this method defines it: one authoritative
  definition per concern, composition over duplication, and the rule that a
  hand-maintained enumeration of a set which will grow is itself the defect.
  Use when two documents or two checks answer the same question, when a rule
  is about to be copied rather than cited, when deciding which document owns a
  concern, and when a second instance of a repair is needed.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-001
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-001 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Custom Generic DRY Principle

## Canonical Abstraction, Inheritance, Composition, and Specialization

With regard to the current task, strictly follow our custom **DRY principle**.

This principle applies universally to:

* Source code
* Documentation
* Architecture
* Policies and standards
* Processes and workflows
* AI prompts and agent definitions
* Research methods and outputs
* Infrastructure and configuration
* Schemas and data models
* Tests and validation rules
* Templates and generated artifacts
* Operational procedures
* Any other reusable knowledge or behaviour

## 1. Core Principle

Every distinct fact, rule, definition, decision, process, contract, structure, or unit of behaviour must have **one authoritative canonical representation**.

All other uses must reuse that canonical representation through:

* Reference
* Inheritance
* Composition
* Implementation
* Parameterization
* Instantiation
* Extension
* Generation

Do not copy an existing concept and independently modify the copy.

The objective is that a future change can be made in **one correct authoritative location** and propagate predictably to every dependent use.

## 2. DRY Applies to Knowledge, Not Just Text

DRY does not mean merely removing identical sentences or identical code.

Two differently worded artifacts that express the same authoritative rule may still be duplicates.

Two identical-looking artifacts may legitimately remain separate when they represent different responsibilities, authorities, meanings, owners, or lifecycles.

Therefore:

* Eliminate duplicated knowledge and behaviour.
* Do not blindly eliminate coincidentally similar text.
* Consolidate only when the artifacts represent the same underlying concept.
* Keep concepts separate when they can legitimately change independently.

## 3. Universal OOP-Inspired Artifact Model

Treat every reusable artifact as though it participates in an object-oriented type system.

### 3.1 Canonical Base or Abstract Class

A canonical base contains shared knowledge, behaviour, structure, or rules that apply to multiple specialized artifacts.

Examples include:

* A company-wide engineering standard
* A general research methodology
* A common deployment workflow
* A base AI-agent policy
* A reusable infrastructure module
* A standard document structure

A base artifact should contain only genuinely common concerns.

Do not create a large universal base merely to centralize unrelated material.

### 3.2 Interface or Contract

An interface defines what an artifact must provide without forcing one specific implementation.

It may define:

* Mandatory sections
* Required inputs
* Required outputs
* Validation rules
* Behavioural guarantees
* Evidence requirements
* Error-handling expectations
* Handoff requirements

Different implementations may satisfy the same contract in different ways.

For example, multiple research processes may implement the same `ResearchOutputContract` while using different domain-specific research methods.

### 3.3 Trait, Mixin, or Reusable Capability

A trait represents a reusable capability that may be composed into otherwise unrelated artifacts.

Examples include:

* Auditability
* Observability
* Security review
* Versioning
* Evidence capture
* Approval handling
* Rollback support
* Tenant isolation
* Error reporting

Use traits for cross-cutting capabilities rather than forcing unrelated artifacts into an artificial inheritance hierarchy.

### 3.4 Derived Class or Specialized Artifact

A derived artifact inherits the applicable content and contract of its parent and contains only:

* Specializations
* Additional requirements
* Explicit overrides
* Context-specific behaviour
* Context-specific configuration

It must not repeat inherited material.

A derived artifact must remain compatible with the parent contract unless it explicitly declares that it is no longer a valid subtype.

### 3.5 Composite Artifact

A composite artifact assembles multiple reusable components, contracts, traits, or modules.

Use composition when an artifact **has**, **uses**, or **combines** capabilities.

Examples include:

* A project workflow composed from intake, validation, approval, execution, and audit components
* An AI agent composed from a role contract, tool policy, safety policy, and project context
* An application composed from reusable domain, persistence, telemetry, and authentication modules

### 3.6 Instance

An instance is a concrete application of a reusable definition.

Examples include:

* A specific project created from a project template
* A particular research run created from a research methodology
* A deployed environment created from an infrastructure module
* A particular agent session created from an agent profile - not the **project profile** of CANON-008, which is a different artifact sharing the word
* A completed report generated from a report schema

Instances should provide values and context. They should not redefine their underlying class, contract, or template.

### 3.7 Override

An override intentionally replaces inherited behaviour for a specific scope.

Every override must state:

* What is being overridden
* Which canonical rule it overrides
* Why the override is necessary
* The scope in which it applies
* Whether it is temporary or permanent
* Who or what authorized it
* What inherited behaviour remains unchanged

An override must contain only the changed behaviour, not a rewritten copy of the entire parent artifact.

### 3.8 Generated Materialization

A generated artifact may contain expanded or duplicated content when required for execution, publication, portability, or compatibility.

It must be marked as:

* Generated
* Non-authoritative
* Derived from a named canonical source
* Regenerable through a known process
* Unsafe to edit directly

Changes must be made to the canonical source and then regenerated.

**A generated artifact is verified as an artifact, not only as a source.**

Where generation **selects, reorders or filters** - a capability composed from
named sections of a canonical document - the output is a document no author
reviewed. It can carry defects present in **none of its inputs**. Reading the
source finds nothing wrong, because the source is consistent; reading the
composition finds nothing wrong, because the selection is defensible. The defect
is the pair, and it exists only in the artifact.

The form this has taken, and the one to check for first, is an **unqualified
self-reference**. A bare *"section 2c"* inside a generated artifact promises a
section of the document the reader is holding - and for a consumer, that artifact
is the only document they hold. Where the composition did not select that
section, the pointer is dead.

Note which way round the strictness runs: a reference that **names** its document
can be resolved against that document, while a reference that names none cannot.
**The unqualified form is the stronger claim and needs the stricter check**, not
the exemption its local appearance invites.

**That holds only while the named document is reachable by the reader**, and for a
consumer the only documents they hold are the ones the distribution ships. A
qualified reference to a source no capability carries is as dead as an unqualified
one — deader, because it looks resolvable. Six canonical sources here are sourced
into no shipped capability, and until 2026-08-05 the exemption covered exactly that
class:
`intake/gaps/gap-2026-08-04-five-canon-documents-ship-to-no-consumer.md`.

So the exemption is **conditional on reachability**, not on the form of the
reference. Whether those six should ship is a separate and still-open question; the
exemption is wrong either way, which is why it was fixed without waiting for it.

So:

* Every self-reference in a generated artifact must resolve inside that artifact.
* A reference that crosses a composition boundary is written **by name** - *"the
  destructive-action limits"* - rather than by number. A number survives
  renumbering badly and extraction not at all.
* Moving a section across such a boundary **carries its references with it**, so
  the check is re-run after the move rather than reasoned about before it.

### 3.9 Fork

A fork is an intentionally independent artifact that no longer inherits future changes from its original source.

A fork must be explicit and record:

* The original source
* The point or version at which it diverged
* The reason for divergence
* The new authority and owner
* Whether reconciliation is expected
* Whether future upstream changes must be reviewed

Never create an accidental fork by copying and editing an artifact.

## 4. Relationship Selection Rules

Before creating or changing anything, determine the correct relationship.

### Use direct reference when:

The exact same concept already exists and no specialization is required.

### Use inheritance when:

The new artifact genuinely **is a specialized form** of an existing artifact and remains substitutable for it.

### Use composition when:

The artifact **has**, **uses**, or **combines** reusable capabilities.

### Use an interface when:

Multiple artifacts must satisfy the same contract but may use different implementations.

### Use a trait or mixin when:

A reusable cross-cutting capability applies to several otherwise unrelated artifacts.

### Use parameterization when:

The structure and behaviour are the same, but values differ.

### Use instantiation when:

Creating a concrete occurrence of an existing template, class, schema, or process.

### Create an independent artifact when:

The concept has a genuinely different meaning, responsibility, authority, owner, or lifecycle.

### Create a fork only when:

Future independent evolution is deliberate and explicitly governed.

## 5. Inheritance Rules

When inheritance is used:

1. The parent remains the canonical source for shared behaviour.
2. The child contains only its differences and additions.
3. Inherited content must not be copied into the child.
4. Parent changes apply automatically unless the child explicitly pins or overrides them.
5. Overrides must be narrow, visible, and justified.
6. A child must honour the parent’s contract and invariants.
7. Inheritance hierarchies must remain shallow and understandable.
8. Inheritance must not be used merely to reuse convenient fragments.
9. Unrelated capabilities must be composed rather than placed in a common artificial parent.
10. Changes must be made at the highest correct abstraction level.

Use the following test:

> Is every valid instance of the proposed child still a valid instance of the parent?

When the answer is no, use composition, an interface, or an independent artifact instead.

## 6. Composition Over Inheritance

Prefer composition when reuse does not represent a true **is-a** relationship.

Inheritance creates strong coupling between a parent and its children. Composition allows reusable capabilities to evolve with clearer boundaries.

Therefore:

* Use inheritance for genuine specialization.
* Use composition for assembled capabilities.
* Use interfaces for shared obligations.
* Use traits for cross-cutting behaviour.
* Use parameters for value-level variation.
* Do not create deep inheritance trees for convenience.

## 7. Canonical Source Rules

Every reusable concept must have an identifiable canonical source.

The canonical source must have:

* A stable name or identifier
* A known location
* A defined responsibility
* A clear authority
* A version or change history where appropriate
* Known dependants or consumers
* A defined method of extension
* A defined method of deprecation

No secondary artifact may silently become an alternative source of truth.

Summaries, examples, indexes, generated outputs, and derived documents must point back to the canonical source.

## 8. Change Placement Rules

Every change must be made at the highest abstraction level where it is universally correct.

### Change the canonical base when:

The change applies to every valid child or use.

### Change a trait or component when:

The change applies to every artifact using that capability.

### Change an interface when:

The contract itself has changed for every implementation.

### Change a derived artifact when:

The change applies only to that specialization.

### Change an instance when:

Only the values or circumstances of that specific occurrence have changed.

### Create an override when:

A specialization must intentionally behave differently from its inherited default.

Do not patch multiple consumers separately when the shared source should be changed once.

## 9. Documentation Rules

Documentation must use the same inheritance and composition model as code.

### Documentation must not:

* Restate canonical policies in multiple files
* Copy whole sections into project-specific documents
* Create competing definitions
* Hide differences inside copied prose
* Require several documents to be manually updated for one conceptual change

### Documentation should instead use:

* Canonical definitions
* Base documents
* Specialized documents containing only deltas
* Shared include fragments
* Transclusion
* Stable cross-references
* Schemas and templates
* Metadata declaring relationships
* Generated views
* Composed indexes
* Explicit overrides

A project-specific document should state:

* Which canonical standards it inherits
* Which contracts it implements
* Which reusable components it composes
* Which parameters it supplies
* Which rules it overrides
* Which additional rules it introduces

It should not reproduce inherited content merely to make the document appear self-contained.

When a self-contained output is required, generate it from canonical sources and mark it as non-authoritative.

## 10. Prompt and AI-Agent Rules

AI prompts, agent profiles, roles, skills, and policies must also follow this principle.

A specialized agent prompt should be composed from:

* A canonical organization-wide agent policy
* A role interface or contract
* Reusable behavioural traits
* Tool-specific policies
* Project-specific context
* Task-specific instance data
* Explicit overrides

Do not create a complete new agent prompt by copying an existing prompt and modifying it.

An agent must not silently restate or reinterpret inherited policy.

Task prompts should supply the current task and parameters rather than redefine the agent’s permanent operating model.

## 11. Workflow and Process Rules

Processes and workflows must be built from reusable stages and contracts.

Examples include:

* Intake
* Classification
* Planning
* Approval
* Execution
* Validation
* Handoff
* Evidence capture
* Escalation
* Rollback
* Closure

A specialized workflow should compose these reusable stages and declare only:

* Its sequence
* Its parameters
* Additional gates
* Specialized validations
* Explicit overrides

Do not copy complete workflows merely to change one step.

## 12. Research Rules

Research must separate reusable methodology from research-run-specific content.

The canonical research methodology should define:

* Evidence standards
* Source quality rules
* Search procedures
* Contradiction handling
* Confidence handling
* Citation requirements
* Validation requirements
* Output contracts

A specific research brief or research run should contain:

* The question
* Context
* Constraints
* Domain-specific extensions
* Required outputs
* Evidence gathered
* Findings and conclusions

It must not redefine the full research methodology.

Reusable findings should be promoted into canonical knowledge artifacts rather than repeatedly rediscovered or copied between reports.

## 13. Infrastructure and Configuration Rules

Infrastructure must use:

* Reusable modules
* Shared policies
* Declarative schemas
* Environment parameters
* Composition
* Generated configuration
* Explicit overlays

Do not copy complete infrastructure definitions between environments.

Environment-specific configuration should contain only values and deliberate differences.

Production, staging, development, tenant, site, and region variants must inherit or compose the same canonical modules unless a documented architectural reason requires divergence.

## 14. Validation and Testing Rules

Validation logic must also be canonical.

Do not independently implement the same rule in several locations without a shared source or generated contract.

Where a rule must exist in multiple execution environments, define it once where possible and:

* Generate compatible implementations
* Share a schema
* Share a contract test
* Validate equivalence
* Record unavoidable divergence

Tests may repeat examples, inputs, and scenarios, but the authoritative business rule must not be duplicated inside test code as a separate implementation.

## 15. Intentional Duplication Exceptions

Duplication is permitted only when there is a concrete operational reason, such as:

* Generated deployment artifacts
* Compiled outputs
* Published self-contained documents
* Offline operation
* External-system limitations
* Legal or regulatory snapshots
* Audit evidence
* Immutable historical records
* Backup and disaster recovery
* Safety-critical redundancy
* Performance or locality requirements
* Compatibility with a system that cannot consume references

Every exception must declare:

* Why duplication is required
* Which copy is authoritative
* Which copy is derived
* How synchronization occurs
* How drift is detected
* How regeneration occurs
* When the exception should be reviewed or removed

Convenience alone is not sufficient justification.

## 16. Anti-Patterns

The following are violations unless explicitly justified:

* Copy-and-edit development
* Copying a document to create a variant
* Restating the same policy in several places
* Parallel sources of truth
* Generic `BaseEverything` abstractions
* Deep inheritance hierarchies
* Hidden overrides
* Untracked forks
* Manually synchronized files
* Reimplementing the same validation rule
* Duplicated prompts with minor wording differences
* Project-specific documents containing complete copies of global standards
* Environment configurations containing copied infrastructure
* Summaries that become unofficial replacement specifications
* Generated files edited directly
* Creating a new abstraction before genuine reuse exists
* Consolidating unrelated concepts merely because they look similar

## 17. Required AI-Agent Behaviour

Before creating a new artifact, the AI agent must:

1. Search for existing canonical sources.
2. Identify the underlying concept or responsibility.
3. Determine whether the new artifact is:

   * A reference
   * A specialization
   * An implementation
   * A composition
   * A trait
   * An instance
   * An override
   * A generated materialization
   * A deliberate fork
   * A genuinely independent concept
4. Reuse the existing source whenever possible.
5. Create a new abstraction only when a real reusable concept exists.
6. Avoid speculative or premature abstractions.
7. State any assumptions when the canonical source cannot be found.
8. Never silently create a competing source of truth.

When modifying existing work, the AI agent must:

1. Find the authoritative source.
2. Apply the change at the highest correct abstraction level.
3. Identify affected children, consumers, instances, and generated outputs.
4. Preserve established contracts unless a contract change is intentional.
5. Record explicit overrides and breaking changes.
6. Update references and dependency metadata.
7. Regenerate derived artifacts where required.
8. Detect and report semantic duplication or drift.

## 18. Required Completion Report

At the end of the task, report:

* The canonical sources used
* Existing components that were reused
* New abstractions that were created
* Interfaces or contracts implemented
* Traits or components composed
* Specialized artifacts created
* Explicit overrides introduced
* Intentional duplication retained
* Forks created or discovered
* Generated artifacts affected
* Dependants that may require regeneration or validation
* Any remaining DRY violations or uncertainty

Do not claim DRY compliance without verifying the relationships between the affected artifacts.

## 19. Final DRY Test

Before considering the work complete, ask:

> If this concept changes tomorrow, can the change be made in one authoritative place and propagate predictably to every relevant use?

Also ask:

> Does every derived artifact contain only its own specialization rather than a rewritten copy of inherited knowledge?

And:

> Have inheritance, composition, interfaces, traits, parameters, and instantiation been used according to their actual relationships rather than merely for convenience?

If any answer is no, the design must be revised or the exception must be explicitly documented.

## 20. Governing Summary

Our custom DRY principle is:

> Define each piece of knowledge or behaviour once at its correct canonical abstraction level. Reuse it through explicit references, contracts, inheritance, composition, traits, parameterization, instantiation, or generation. Derived artifacts contain only their differences. Overrides and forks are explicit. Generated copies are non-authoritative. Intentional duplication is traceable and justified. Every change must occur at the highest correct abstraction level so that it propagates predictably without creating competing sources of truth.

## Scope of this skill

A rule stated twice is a rule that will be wrong twice. Fix the system that
permitted the duplication, not the instance.
