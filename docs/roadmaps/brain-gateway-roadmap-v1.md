# Emma Brain Gateway Roadmap v1.0 (Frozen)

## Document Status

Version: 1.0 (Frozen)

Status: Roadmap Freeze — Approved Baseline

Scope: Brain Gateway architecture initiative (Phase 0 – Phase 7)

Owner: Emma Engineering

## Objective

Create a production-ready Brain Gateway architecture that becomes the single inference entry point for Emma while remaining provider-agnostic, scalable, maintainable, and capable of evolving from OpenRouter-based development to hybrid and fully self-hosted inference without requiring major application refactoring.

This roadmap defines the official execution plan for the Brain Gateway initiative.

**This is a Roadmap Freeze. No implementation work shall begin until the appropriate architecture phases have been completed and approved.**

## Roadmap Freeze Rules

This document becomes the official source of truth for the Brain Gateway project. The following rules apply throughout the project lifecycle.

1. This roadmap is considered Brain Gateway Roadmap v1.0 (Frozen).
2. Every phase must be completed before moving to the next phase unless explicitly stated otherwise.
3. Major architectural decisions must be documented through ADRs rather than implementation.
4. Implementation must follow the approved architecture, not redefine it.
5. Any scope expansion after this freeze requires either:
   - a Roadmap revision (v1.1, v1.2, etc.), or
   - an approved ADR.
6. Brain Gateway must remain provider-agnostic. Emma application layers must never depend directly on any LLM provider.
7. No implementation PRs may be created before Architecture Freeze approval (Phase 3.1).

## Current Status

| Phase     | Name                              | Objective                                        | Deliverable                 | Status      |
| --------- | --------------------------------- | ------------------------------------------------ | --------------------------- | ----------- |
| —         | Roadmap Freeze                    | Establish this document as source of truth       | Frozen Roadmap              | Complete    |
| Phase 0   | Required Input Review             | Understand the existing AI architecture          | Review Report               | Not Started |
| Phase 1   | Brain Gateway Architecture Review | Analyze the current implementation               | Architecture Review Report  | Not Started |
| Phase 2   | Gap Analysis                      | Compare current architecture against target      | Gap Analysis Report         | Not Started |
| Phase 3   | Architecture Discovery            | Design the future Brain Gateway architecture     | Architecture Design Package | Not Started |
| Phase 3.1 | Architecture Freeze               | Finalize architecture and ADR approval           | Architecture Freeze Report  | Not Started |
| Phase 4   | Technical Design                  | Produce implementation specifications            | Technical Design Documents  | Not Started |
| Phase 4.1 | Independent Technical Review      | Validate technical design before coding          | Technical Review Report     | Not Started |
| Phase 5   | Implementation Planning           | Create implementation roadmap and execution plan | Implementation Plan         | Not Started |
| Phase 6   | Incremental Implementation        | Implement Brain Gateway incrementally            | Pull Requests               | Not Started |
| Phase 7   | Production Readiness Review       | Validate production readiness                    | Production Readiness Report | Not Started |

No implementation work has started. No code changes, git operations, or pull requests have been made under this initiative.

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

Create an execution strategy.

**Deliverables**

- Sprint Plan
- Dependency Order
- Risk Plan
- Migration Plan
- Rollback Plan
- Testing Plan

**Exit Criteria**

- Implementation sequence finalized.

### Phase 6 — Incremental Implementation

**Objective**

Implement Brain Gateway incrementally.

Each implementation phase must include:

- Unit tests
- Integration tests
- Documentation updates
- ADR updates (if required)
- Architecture conformance verification

Every completed implementation phase must finish with:

- Commit
- Push to GitHub
- Pull Request
- Review before merge

No direct implementation should bypass the approved architecture.

### Phase 7 — Production Readiness Review

**Objective**

Validate Brain Gateway for production deployment.

**Scope**

Review:

- Reliability
- Performance
- Scalability
- Observability
- Cost management
- Security
- Failure recovery
- Monitoring
- Documentation completeness
- Operational readiness

**Deliverables**

- Production Readiness Report
- Final Risk Assessment
- Go / No-Go Recommendation

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

Upon completion of each implementation phase (Phase 6 and any subsequent implementation sub-phases), the work must conclude with the following finalization tasks:

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

Changes to the roadmap may only be made through a Roadmap revision (v1.1, v1.2, etc.) or an approved ADR that explicitly supersedes or amends previous decisions.

Implementation details must not be added to this roadmap; all technical details must reside in the ADRs and Technical Design Documents for each respective phase.

The next phase must not begin until the previous phase's exit criteria have been met and approved.
