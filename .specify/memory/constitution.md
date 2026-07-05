<!--
Sync Impact Report
- Version change: template (unversioned) → 1.0.0
- Rationale: Initial ratification. The constitution file previously contained only
  unfilled template placeholders; this is the first concrete set of governing
  principles for the project, hence MAJOR version 1.0.0.
- Modified principles: n/a (all principles newly defined, none renamed)
- Added sections:
  - I. Test-First (TDD) (NON-NEGOTIABLE)
  - II. Mutation-Verified Business Logic (NON-NEGOTIABLE)
  - III. Property-Based Testing for Numeric & Algorithmic Logic
  - IV. Requirement Traceability
  - V. AI Resilience & Graceful Degradation
  - VI. Accessible, Mobile-First Interface
  - VII. Simplicity & Reviewable Code
  - VIII. Observability & Debuggable Failures
  - Academic Deliverables & Documentation Rigor (Section 2)
  - Development Workflow & Quality Gates (Section 3)
  - Governance
- Removed sections: none (template placeholders replaced, no prior content existed)
- Templates requiring updates:
  - ✅ .specify/templates/tasks-template.md — updated: tests reframed as mandatory
    (not optional), mutation/property/accessibility/AI-resilience gates added
  - ✅ .specify/templates/spec-template.md — updated: acceptance scenarios now
    note the traceability requirement
  - ⚠ .specify/templates/plan-template.md — Constitution Check section is
    dynamic ("Gates determined based on constitution file"); no hardcoded
    edit needed, but confirm /speckit-plan pulls gates I–VIII when run
  - ⚠ .specify/templates/checklist-template.md — pending manual review; no
    principle-specific content currently required
  - n/a README.md / quickstart docs — do not yet exist in this repo
- Follow-up TODOs: none; all placeholders resolved for this initial version.
-->

# Bot-Estudio Constitution

## Core Principles

### I. Test-First (TDD) (NON-NEGOTIABLE)

Tests MUST be written from acceptance criteria and MUST fail before any
implementation code is written to satisfy them. Red-Green-Refactor MUST be
followed for all business logic, API integrations, and UI components with
behavior. A task MUST NOT be marked complete unless its test(s) existed in a
failing state prior to the corresponding implementation.

**Rationale**: This project is the deliverable for a university Software
Assurance and Quality Testing course; test-first discipline is the core
competency being assessed, not an optional practice.

### II. Mutation-Verified Business Logic (NON-NEGOTIABLE)

All business logic — the spaced-repetition scheduling engine, the timed
exam-simulator scoring, and the Feynman-mode evaluation logic — MUST maintain
a mutation score of at least 80%, measured by a mutation testing tool run
against that code. A change that drops mutation score below 80% on these
modules MUST NOT merge until surviving mutants are killed or the gap is
explicitly justified in Complexity Tracking.

**Rationale**: Line/branch coverage does not prove tests catch real faults.
The course grades assurance depth, and mutation score is the concrete
evidence that tests actually fail when the logic is broken.

### III. Property-Based Testing for Numeric & Algorithmic Logic

The spaced-repetition engine and any other numeric or algorithmic
computation (interval calculation, scoring formulas, timers) MUST be covered
by property-based tests that assert invariants across generated inputs, in
addition to example-based tests. Example-only suites are insufficient for
these modules.

**Rationale**: Interval and scoring math has boundary cases (streak resets,
zero/negative durations, date-boundary reviews) that hand-picked examples
systematically miss; generated-input properties catch what examples don't.

### IV. Requirement Traceability

Every acceptance criterion in every `spec.md` MUST be linked to at least one
automated test before its corresponding task in `tasks.md` is marked
complete. The mapping (e.g., a criterion ID referenced in the test name or a
traceability table) MUST be preserved so a requirement can be traced to its
test and back.

**Rationale**: Academic grading and any future audit need to verify that
every stated requirement is actually tested — not just that the suite
passes in aggregate.

### V. AI Resilience & Graceful Degradation

Every call to the Gemini LLM API MUST handle three failure modes — timeout,
quota exhaustion, and no connectivity — and MUST fall back to the local
model in each case. Each of the three scenarios MUST have a dedicated
automated test (simulated timeout, simulated quota/429 error, simulated
network failure) that verifies the fallback executes and the user still
receives an evaluation.

**Rationale**: Feynman-mode evaluation depends on an external API whose
availability the course cannot guarantee; the study session must not fail
just because the remote model is unreachable.

### VI. Accessible, Mobile-First Interface

The UI MUST be designed mobile-first and MUST meet WCAG 2.1 AA as a minimum
bar (color contrast, keyboard/touch navigation, screen-reader labels, focus
management). Accessibility checks are part of the definition of done for any
UI-facing task, verified with automated linting (e.g., axe) plus manual
spot-checks on the exam-simulator and Feynman-mode screens.

**Rationale**: The app is used from a phone while studying; skipping
accessibility excludes real users and is an explicit grading criterion for
this course.

### VII. Simplicity & Reviewable Code

Prefer the simplest design that satisfies the current spec. YAGNI applies:
no speculative abstractions, feature flags, or configuration surfaces for
hypothetical future requirements. Business logic (scheduling, scoring,
evaluation) MUST stay decoupled from the UI layer and from the specific LLM
provider so each piece remains independently testable.

**Rationale**: Keeps the mutation and property-based test suites tractable
and keeps a student-scoped, single-term project reviewable and gradable.

### VIII. Observability & Debuggable Failures

All I/O boundaries (LLM calls, persistence, timers) MUST emit structured
logs sufficient to reconstruct a failure: what was called, which fallback
(if any) fired, and why. Errors surfaced to the user MUST be distinguishable
in logs from expected fallback paths.

**Rationale**: Distinguishes "the AI-resilience fallback worked as designed"
from "the fallback silently masked a bug" — essential when grading requires
demonstrating that fallback paths actually trigger correctly, not just that
no exception escaped.

## Academic Deliverables & Documentation Rigor

This project is built via Spec-Driven Development (Spec Kit) as the
deliverable for a university Software QA course. For every feature,
`spec.md`, `plan.md`, and `tasks.md` MUST stay consistent with each other and
with the implemented code. Before a feature is considered done, run
`/speckit-analyze` (or an equivalent manual cross-check) and resolve any
drift in the documents themselves — never leave it unresolved. These
artifacts are graded deliverables and MUST be written clearly enough for an
external reviewer (the instructor) to audit the chain from requirement to
test to code without additional explanation.

## Development Workflow & Quality Gates

Before a feature branch is considered mergeable, it MUST show evidence of:

- Tests written and observed failing before the corresponding implementation
  (Principle I).
- Mutation score ≥ 80% on any touched business-logic module (Principle II).
- Property-based tests covering any touched numeric/algorithmic logic
  (Principle III).
- Traceability links from touched acceptance criteria to their tests
  (Principle IV).
- Dedicated tests for timeout, quota-exhaustion, and no-connectivity paths on
  any touched Gemini call site (Principle V).
- Automated accessibility checks (plus manual spot-check where the UI
  changed) meeting WCAG 2.1 AA (Principle VI).

Self-review against this checklist is acceptable for this solo/course
project, but it MUST be performed and MUST be visible (e.g., in the PR
description or task notes) — not assumed.

## Governance

This constitution supersedes ad hoc practice. Where a spec, plan, or task
conflicts with a principle here, the constitution wins unless it is amended
first through the process below.

**Amendment procedure**: Propose the change → update this file, including
the Sync Impact Report at the top → assign a new version per the versioning
policy below → propagate the change to any dependent template or command
file → record the amendment date.

**Versioning policy** (semantic versioning for this document):
- MAJOR: Backward-incompatible governance changes, or removal/redefinition
  of an existing principle.
- MINOR: A new principle or materially expanded section is added.
- PATCH: Wording clarifications and non-semantic fixes.

**Compliance review**: `/speckit-analyze` (or manual re-check) MUST confirm
a feature's plan and tasks comply with these principles before
`/speckit-implement` runs on that feature. Any Complexity Tracking entry that
justifies a deviation MUST name the specific principle being deviated from.

**Version**: 1.0.0 | **Ratified**: 2026-07-05 | **Last Amended**: 2026-07-05
