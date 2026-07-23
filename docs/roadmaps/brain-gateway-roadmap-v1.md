# Emma Brain Gateway Roadmap v1.1

## Document Status

Version: 1.1 (extends v1.0 Frozen)

Status: Roadmap Freeze — Approved Baseline, extended per Roadmap Freeze Rule 5 ("Any scope expansion after this freeze requires... a Roadmap revision")

Scope: Brain Gateway architecture initiative (Phase 0 – Phase 8.1)

Owner: Emma Engineering

### Revision Note (v1.0 → v1.1)

v1.0 froze Phase 0 – Phase 4.1 (Required Input Review through Independent Technical Review) and left Phase 5 ("Implementation Planning"), Phase 6 ("Incremental Implementation"), and Phase 7 ("Production Readiness Review") as short placeholder descriptions, since implementation planning was not yet in scope when the architecture-and-design roadmap was written.

v1.1 is a **scope-expansion revision, not an architectural one**: it replaces those three placeholder phases with a fully specified Implementation & Production Validation extension — decomposing them into Phase 5, Phase 5.1, Phase 6, Phase 6.1, Phase 7, Phase 8, and Phase 8.1. No ADR is superseded, no Architecture Freeze content is altered, and Phase 0 – Phase 4.1 are unchanged below. This revision governs everything **after** the implementation-ready Technical Design that Phase 4.1 approved (PR #157, merged) — implementation planning, implementation execution, implementation verification, production hardening, live validation, and production readiness.

All architectural decisions remain governed exclusively by the Architecture Freeze (Phase 3.1) and ADR-0006–ADR-0014. Phases 5–8.1 introduce no architecture decisions.

#### Follow-up Refinement (within v1.1, pre-merge)

Before this v1.1 revision merged, it was further refined — still documentation-only, still introducing no architecture/ADR/Technical Design change — to: (a) decompose Phase 6 into six independently reviewable, independently testable, independently reversible implementation waves (6A–6F); (b) expand Phase 7's Integration Verification pipeline into a complete subsystem-interaction inventory; (c) add Recovery Validation and Compatibility Validation as dedicated Phase 8 subsections; and (d) add Operational Success Metrics as objective, measurable inputs to the Phase 8.1 Go/No-Go decision. These are sequencing and validation-granularity refinements to phases this same revision already introduced — not a new scope expansion — so the roadmap remains v1.1 rather than advancing to v1.2.

## Objective

Create a production-ready Brain Gateway architecture that becomes the single inference entry point for Emma while remaining provider-agnostic, scalable, maintainable, and capable of evolving from OpenRouter-based development to hybrid and fully self-hosted inference without requiring major application refactoring.

This roadmap defines the official execution plan for the Brain Gateway initiative.

**This is a Roadmap Freeze. No implementation work shall begin until the appropriate architecture phases have been completed and approved.**

## Roadmap Freeze Rules

This document becomes the official source of truth for the Brain Gateway project. The following rules apply throughout the project lifecycle.

1. This roadmap is considered Brain Gateway Roadmap v1.0 (Frozen), extended by this v1.1 revision (§Revision Note).
2. Every phase must be completed before moving to the next phase unless explicitly stated otherwise.
3. Major architectural decisions must be documented through ADRs rather than implementation.
4. Implementation must follow the approved architecture, not redefine it.
5. Any scope expansion after this freeze requires either:
   - a Roadmap revision (v1.1, v1.2, etc.), or
   - an approved ADR.
6. Brain Gateway must remain provider-agnostic. Emma application layers must never depend directly on any LLM provider.
7. No implementation PRs may be created before Architecture Freeze approval (Phase 3.1).

## Current Status

| Phase     | Name                                       | Objective                                                                                                                                 | Deliverable                                                                                                                                                                                                                                         | Status                    |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| —         | Roadmap Freeze                             | Establish this document as source of truth                                                                                                | Frozen Roadmap                                                                                                                                                                                                                                      | Complete                  |
| Phase 0   | Required Input Review                      | Understand the existing AI architecture                                                                                                   | Review Report                                                                                                                                                                                                                                       | Not Started               |
| Phase 1   | Brain Gateway Architecture Review          | Analyze the current implementation                                                                                                        | Architecture Review Report                                                                                                                                                                                                                          | Not Started               |
| Phase 2   | Gap Analysis                               | Compare current architecture against target                                                                                               | Gap Analysis Report                                                                                                                                                                                                                                 | Not Started               |
| Phase 3   | Architecture Discovery                     | Design the future Brain Gateway architecture                                                                                              | Architecture Design Package                                                                                                                                                                                                                         | Not Started               |
| Phase 3.1 | Architecture Freeze                        | Finalize architecture and ADR approval                                                                                                    | Architecture Freeze Report                                                                                                                                                                                                                          | Not Started               |
| Phase 4   | Technical Design                           | Produce implementation specifications                                                                                                     | Technical Design Documents                                                                                                                                                                                                                          | Complete                  |
| Phase 4.1 | Independent Technical Review               | Validate technical design before coding                                                                                                   | Technical Review Report                                                                                                                                                                                                                             | Complete                  |
| Phase 5   | Implementation Planning                    | Transform the approved Technical Design into an executable implementation plan                                                            | Implementation Plan (WBS, dependency graph, PR/branch strategy, migration/rollback/test-gate strategy, risk register, sprint breakdown, completion report)                                                                                          | Complete                  |
| Phase 5.1 | Independent Implementation Planning Review | Independently verify Phase 5 produces a safe, complete implementation plan                                                                | Planning Review Report, Dependency/Rollout/Risk assessments, Planning Traceability Matrix                                                                                                                                                           | Complete (pending review) |
| Phase 6   | Implementation (Waves 6A–6F)               | Implement every approved Technical Design specification, decomposed into six independently reviewable, testable, and reversible waves     | Implementation PRs, per-wave Implementation Report (6A–6F), Migration Report, Testing Report                                                                                                                                                        | Not Started               |
| Phase 6.1 | Independent Implementation Review          | Verify implementation faithfully matches Technical Design, ADRs, and Architecture Freeze                                                  | Implementation Review Report, Architecture Compliance Report, Code Quality Report, Regression Assessment                                                                                                                                            | Not Started               |
| Phase 7   | Integration Verification                   | Verify the implemented Brain Gateway works correctly integrated with the complete Emma platform, across every subsystem interaction point | Integration Report, Compatibility Matrix, Regression Report, Performance Baseline, Integration Summary                                                                                                                                              | Not Started               |
| Phase 8   | Production Hardening & Live Validation     | Validate Brain Gateway under realistic operating conditions before production release                                                     | Production Hardening Report, Load/Chaos Test Reports, Recovery Validation Report, Provider Compatibility Report, Operational Success Metrics, Observability Report, Performance Benchmark, Operational Risk Register, Production Validation Summary | Not Started               |
| Phase 8.1 | Independent Production Readiness Review    | Conduct the final independent review before production deployment                                                                         | Production Readiness Review, Deployment Risk Assessment, Go/No-Go Report, Production Checklist, Operational Acceptance Report                                                                                                                       | Not Started               |

Phase 0 – Phase 4.1 are complete (PRs #145–#157, merged); Phase 5 (Implementation Planning) and Phase 5.1 (Independent Implementation Planning Review) are both complete, pending this pull request's approval before Phase 6A begins. No Phase 6–8.1 implementation work has started. No production code changes have been made under this initiative — only architecture, ADR, technical-design, and implementation-planning documentation.

## Phase Descriptions

### Phase 0 — Required Input Review

**Objective**

Build a complete understanding of Emma's existing AI architecture before making any architectural decisions.

**Scope**

Review all existing documentation and implementation related to:

- AI request flow
- Brain-related modules
- Memory system
- Prompt construction
- Context management
- Provider integration
- TTS
- Avatar interaction
- Existing ADRs
- Existing technical debt

**Deliverables**

- Existing Architecture Inventory
- Dependency Inventory
- Current AI Flow
- Documentation Review Report
- Initial Findings

**Exit Criteria**

- Complete understanding of the current architecture.
- No architectural decisions.
- No implementation.

### Phase 1 — Brain Gateway Architecture Review

**Objective**

Review the current architecture objectively.

**Scope**

Analyze:

- Current request lifecycle
- Provider coupling
- Context pipeline
- Memory pipeline
- Behavior pipeline
- Emotion pipeline
- Prompt generation
- Response validation
- Cost tracking
- Logging
- Error handling
- Retry strategy
- Extension points

**Deliverables**

- Architecture Review Report
- Current Architecture Diagram
- Risk Assessment
- Technical Debt Assessment

**Exit Criteria**

- The current architecture is fully understood.
- No redesign yet.

### Phase 2 — Gap Analysis

**Objective**

Identify the differences between the current implementation and the desired Brain Gateway architecture.

**Deliverables**

Gap Analysis Report, including:

- Missing abstractions
- Missing boundaries
- Coupling analysis
- Migration risks
- Scalability concerns
- Performance considerations
- Security considerations

**Exit Criteria**

- All architectural gaps have been identified.

### Phase 3 — Architecture Discovery

**Objective**

Design the target Brain Gateway architecture.

**Scope**

Design:

- System boundaries
- Brain Gateway responsibilities
- Provider abstraction
- Capability Registry
- Model Registry
- Routing Engine
- Context Pipeline
- Memory Pipeline
- Behavior Pipeline
- Emotion Pipeline
- Prompt Pipeline
- Response Validation
- Retry
- Fallback
- Analytics
- Cost Tracking
- Configuration
- Extension Model

**Deliverables**

- Brain Gateway Architecture Document
- Architecture Diagrams
- Sequence Diagrams
- Component Diagrams
- Proposed ADRs

**Exit Criteria**

- Architecture is complete but not yet frozen.

### Phase 3.1 — Architecture Freeze

**Objective**

Approve the architecture as the implementation baseline.

**Deliverables**

- Architecture Freeze Report
- Approved ADRs
- Frozen Component Boundaries
- Final Architecture Diagrams

**Exit Criteria**

- Architecture is officially frozen.
- Fundamental architectural changes require new ADRs.

### Phase 4 — Technical Design

**Objective**

Translate the approved architecture into implementation specifications.

**Scope**

Specify:

- Module structure
- Interfaces
- Public contracts
- Configuration
- APIs
- Registry format
- Provider contracts
- Error model
- Testing strategy
- Migration strategy

**Deliverables**

- Technical Design Specification
- Interface Specifications
- Module Specifications
- Implementation Guidelines

**Exit Criteria**

- Implementation can begin without making architectural decisions.

### Phase 4.1 — Independent Technical Review

**Objective**

Perform an independent review of the technical design.

**Review Focus**

- Architectural consistency
- Hidden coupling
- Dependency cycles
- Interface quality
- Scalability
- Extensibility
- Failure handling
- Migration feasibility
- Production readiness

**Deliverables**

- Independent Technical Review Report

**Exit Criteria**

- Technical design approved.

### Phase 5 — Implementation Planning

**Objective**

Transform the approved Technical Design into an executable implementation plan.

The implementation must be decomposed into independently reviewable, low-risk work packages.

No production code may be written.

**Deliverables**

- Work Breakdown Structure (WBS)
- Implementation Dependency Graph
- Module Implementation Order
- Pull Request Strategy
- Branch Strategy
- Migration Plan
- Rollback Strategy
- Test Gate Strategy
- Risk Register
- Sprint Breakdown
- Phase 5 Completion Report

**Exit Criteria**

- Every Technical Design section assigned to implementation tasks.
- Dependency order verified.
- Rollback defined.
- Implementation sequence approved.

### Phase 5.1 — Independent Implementation Planning Review

**Objective**

Independently verify that Phase 5 produces a safe, complete implementation plan.

**Review**

- WBS
- Dependency graph
- Rollout order
- Rollback safety
- Sprint boundaries
- Implementation feasibility

No implementation.

**Deliverables**

- Planning Review Report
- Dependency Validation
- Rollout Validation
- Risk Assessment
- Planning Traceability Matrix
- Review Summary

### Phase 6 — Implementation

**Objective**

Implement every approved Technical Design specification.

Architecture changes are prohibited.

ADR modifications are prohibited.

Implementation must follow the approved execution plan.

To keep implementation reviewable, independently testable, independently reversible, and low-risk, Phase 6 is decomposed into six implementation waves (6A–6F). Each wave covers a cohesive slice of the Technical Design and:

- produces its own Implementation Report;
- passes its own validation gates (unit, integration, and regression tests scoped to that wave) before the next wave begins;
- may be reviewed independently under Phase 6.1;
- may be rolled back independently of every other wave, per the Technical Design's per-step rollback guarantee (`docs/phase4-brain-gateway-technical-design.md` §18).

#### Phase 6A — Core Infrastructure

**Scope:** Provider Registry, Capabilities Descriptor, Shared Interfaces, Dependency Injection.

**Deliverable:** Phase 6A Implementation Report.

#### Phase 6B — Provider Layer

**Scope:** OpenRouter Adapter, Future Provider Adapters, Provider Conformance.

**Deliverable:** Phase 6B Implementation Report.

#### Phase 6C — Routing Engine

**Scope:** Capability Routing (Layer 2), Fallback, Retry. Policy Routing (Layer 3) remains explicitly out of scope for this wave — per ADR-0007 and the Phase 4 Technical Design §5.4, Layer 3 has no approved design and requires a future ADR/Architecture Freeze revisit before any implementation; this roadmap revision does not authorize it.

**Deliverable:** Phase 6C Implementation Report.

#### Phase 6D — Context & Prompt

**Scope:** Context Pipeline, Prompt Composition, Token Budget.

**Deliverable:** Phase 6D Implementation Report.

#### Phase 6E — Memory

**Scope:** Ranking, Retrieval, Database Integration.

**Deliverable:** Phase 6E Implementation Report.

#### Phase 6F — Operational & Governance

**Scope:** Telemetry, Metrics, Tracing, Configuration, Lint Rules, Extension Model.

**Deliverable:** Phase 6F Implementation Report.

**Deliverables (Phase 6, overall)**

- Implementation PRs (one or more per wave)
- Implementation Report per wave (6A–6F)
- Migration Report
- Testing Report

**Exit Criteria**

- All six waves (6A–6F) complete.
- Tests passing for every wave.
- Migration complete.
- Documentation updated.

### Phase 6.1 — Independent Implementation Review

**Objective**

Verify implementation faithfully matches:

- Technical Design
- ADRs
- Architecture Freeze

**Review**

- Implementation fidelity
- Interface correctness
- Architectural compliance
- Coding standards
- Regression risk

**Deliverables**

- Implementation Review Report
- Architecture Compliance Report
- Code Quality Report
- Regression Assessment

### Phase 7 — Integration Verification

**Objective**

Verify the implemented Brain Gateway works correctly when integrated with the complete Emma platform.

**Focus**

- End-to-end behavior
- Subsystem integration
- Compatibility

**Verification Areas**

Complete subsystem-interaction inventory:

API → Brain Gateway → Provider Registry → Routing Engine → Provider Adapter → Context Pipeline → Memory Pipeline → Prompt Composition → Response Validation → Cost Gate → Telemetry → Logging → Sentry → Avatar / TTS

The Integration Report must verify every interaction point in the chain above, not only the endpoints.

**Deliverables**

- Integration Report
- Compatibility Matrix
- Regression Report
- Performance Baseline
- Integration Summary

**Exit Criteria**

- No blocking integration issues.

### Phase 8 — Production Hardening & Live Validation

**Objective**

Validate Brain Gateway under realistic operating conditions before production release.

Unlike previous phases, this phase evaluates operational behavior rather than implementation correctness.

**Validation Areas**

- **Live Traffic Validation** — realistic request simulation.
- **Multi-Provider Validation** — verify every supported provider (see Compatibility Validation below for the detailed capability matrix).
- **Load Testing** — concurrent requests, burst traffic, queue behavior.
- **Soak Testing** — 24-hour, 48-hour, 72-hour continuous execution.
- **Chaos Testing** — provider outage, network interruption, timeout, partial failure, retry exhaustion, malformed responses, streaming interruption.
- **Observability Validation** — logging, metrics, tracing, correlation IDs, Sentry, health monitoring.
- **Memory Validation** — ranking, retrieval, deduplication, context quality.
- **Prompt Validation** — persona stability, prompt composition, instruction ordering, tool prompts.
- **Context Validation** — budget enforcement, summarization, priority resolution, overflow behavior.
- **Cost Validation** — token usage, provider cost, retry cost, caching effectiveness.
- **Performance Benchmark** — P50, P90, P95, P99 latency, throughput.
- **Security Validation** — provider credentials, secrets, boundary enforcement, data isolation.
- **Real User Validation** — internal testing, closed beta, controlled production users, feedback analysis.

#### Recovery Validation

Recovery behavior is evaluated independently from normal operation. Validation scenarios:

- Provider outage recovery
- Retry recovery
- Fallback recovery
- Deployment rollback recovery
- Configuration recovery
- Database recovery
- Cache recovery
- Service restart recovery
- Queue recovery (if applicable)

Recovery Validation is a required Production Hardening deliverable (Recovery Validation Report, below) — Phase 8 is not considered complete without it.

#### Compatibility Validation

Validates every supported provider against the Brain Gateway capability contract (`CapabilitiesDescriptor`, ADR-0006), independently of any provider's implementation details:

Provider → Streaming → Vision → Tool Calling → Structured Output → Embeddings → Audio → Image → Future Capabilities

For each provider, document:

- Supported capabilities
- Unsupported capabilities
- Degraded behavior
- Fallback behavior

#### Operational Success Metrics

Measurable production targets, defined here as objective inputs to the Phase 8.1 Go/No-Go decision:

- P50 / P90 / P95 / P99 latency
- Throughput
- Request success rate
- Provider failure recovery rate
- Retry success rate
- Routing accuracy
- Context assembly correctness
- Memory retrieval quality
- Observability coverage
- Logging coverage
- Correlation ID propagation
- Cost accuracy

**Deliverables**

- Production Hardening Report
- Load Test Report
- Chaos Test Report
- Recovery Validation Report
- Provider Compatibility Report (capability matrix + supported/unsupported/degraded/fallback behavior)
- Operational Success Metrics Report
- Observability Report
- Performance Benchmark
- Operational Risk Register
- Production Validation Summary

**Exit Criteria**

- No unresolved Critical issues.
- No High-risk issues without documented mitigation.
- Load testing completed successfully.
- Chaos testing completed successfully.
- Recovery validation completed successfully.
- Provider compatibility validation completed.
- Operational success metrics achieved, or approved deviations documented.
- Observability fully validated.
- Rollback procedures verified.
- Operational documentation completed.

### Phase 8.1 — Independent Production Readiness Review

**Objective**

Conduct the final independent review before production deployment.

This phase determines deployment readiness.

**Review Areas**

- Implementation quality
- Operational readiness
- Performance
- Reliability
- Observability
- Maintainability
- Operational risk
- Documentation
- Deployment readiness
- Rollback readiness

**Deliverables**

- Production Readiness Review
- Deployment Risk Assessment
- Go / No-Go Report
- Production Checklist
- Operational Acceptance Report

**Possible Outcomes**

- **GO** — Production deployment approved.
- **GO WITH CONDITIONS** — Deployment permitted after specified conditions.
- **NO GO** — Deployment blocked until critical issues resolved.

## Governance Rules (Phases 5–8.1)

Throughout Phases 5–8.1:

- Architecture decisions remain frozen.
- No ADR modifications unless a formal ADR supersedes an existing decision.
- Technical Design changes require review.
- Architecture changes require a new ADR.

## Final Completion Criteria

The Brain Gateway initiative is considered complete only when all of the following have been achieved:

1. Architecture approved.
2. ADRs approved.
3. Technical Design approved.
4. Implementation completed (all waves 6A–6F).
5. Independent implementation review completed.
6. Integration verification passed (every subsystem interaction point, §Phase 7).
7. Production hardening completed (including Recovery Validation and Compatibility Validation).
8. Live validation completed (Operational Success Metrics achieved or approved deviations documented).
9. Independent production readiness review returns GO or GO WITH CONDITIONS.
10. Deployment completed successfully.

## Guiding Principles

The following principles apply throughout every phase of this roadmap:

1. Brain Gateway is the sole entry point for all LLM inference.
2. Emma must remain completely provider-agnostic.
3. Providers are implementation details hidden behind Brain Gateway.
4. Model selection is capability-driven rather than hardcoded.
5. Architecture must be finalized before implementation.
6. Every architectural decision must prioritize long-term maintainability over short-term convenience.
7. Incremental implementation must preserve architectural integrity and avoid introducing provider-specific coupling into higher application layers.

## Finalization Requirements

Upon completion of each implementation phase (Phase 6 — completed per wave, 6A through 6F — Phase 7, Phase 8, and any subsequent implementation sub-phases), the work must conclude with the following finalization tasks:

1. Verify all implementation deliverables and tests are complete.
2. Commit changes with clear, descriptive commit messages.
3. Push the implementation branch to the GitHub repository.
4. Create a Pull Request for review when working on a feature branch.
5. If implementation is performed directly on the main branch by explicit decision, document that a Pull Request is not applicable instead of creating one.

These finalization tasks are mandatory and are considered part of the completion criteria for every implementation phase. This ensures every change follows a consistent, reviewable, and traceable delivery process aligned with the Emma project's development workflow.

## Relationship to Prior Brain Gateway Work

`docs/adr/ADR-0003-brain-gateway-architecture.md` and `docs/phase7b-brain-gateway-implementation-report.md` document the OpenRouter-only gateway (`src/core/brain/`) already shipped on 2026-07-14. That implementation is treated as existing-architecture input to Phase 0 of this roadmap, not a substitute for it — this roadmap governs a new, more rigorous architecture process for evolving that gateway toward a fully provider-agnostic, hybrid/self-hosted-capable design.

## Roadmap Governance

This roadmap is the single source of truth for the Brain Gateway initiative.

Changes to the roadmap may only be made through a Roadmap revision (v1.1, v1.2, etc.) or an approved ADR that explicitly supersedes or amends previous decisions. This document is itself the v1.1 revision that expanded Phase 5–7 into Phase 5, 5.1, 6, 6.1, 7, 8, 8.1 and, in a pre-merge follow-up refinement, decomposed Phase 6 into Waves 6A–6F and added Recovery Validation, Compatibility Validation, and Operational Success Metrics to Phase 8 (§Revision Note); any future scope expansion requires v1.2 or later.

Implementation details must not be added to this roadmap; all technical details must reside in the ADRs and Technical Design Documents for each respective phase.

The next phase must not begin until the previous phase's exit criteria have been met and approved.
