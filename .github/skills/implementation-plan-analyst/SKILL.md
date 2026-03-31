---
name: implementation-plan-analyst
description: "Review an unimplemented implementation-plan draft for bad ideas, goal mismatch, missing or wrong changes, complexity and coupling growth, poor language best practices, weak architecture integration, and whether refactoring is better than patching. Use when auditing a proposal draft by severity without editing code."
argument-hint: "Provide objective and draft-plan details (not implemented code), plus optional architecture references."
user-invocable: true
---

# Implementation Plan Analyst

## What This Skill Produces
A review-only audit report that ranks issues by severity and decides whether the proposal should be rejected, revised, or replaced by refactoring.

## Input Assumption
- Every invocation is based on an unimplemented proposal draft.
- Treat all implementation statements as planned changes, not completed changes.
- Do not switch into code review of already-shipped behavior.

## When to Use
- You need to judge if a proposed implementation is fundamentally harmful.
- You need to check whether implementation changes match the stated objective.
- You need a maintainability-first review that ignores migration cost.
- You need architecture fit analysis rather than patch-level comments.

## Non-Negotiable Principles
1. Do not preserve backward compatibility by default.
2. Ignore delivery cost; optimize for maintainability, elegance, and long-term clarity.
3. Do not edit code in this workflow; provide analysis only.
4. Do not treat missing tests as a finding in this workflow.

## Required Review Dimensions
1. Is the plan itself a bad idea that works against the goal?
2. Does implementation match the goal, with no missed or wrong changes?
3. Does implementation increase complexity or coupling unnecessarily?
4. Is the implementation inelegant or against language best practices?
5. Is the implementation poorly integrated into the existing architecture?
6. Is refactoring better than incremental modification?

## Procedure
1. Extract context.
- Identify the objective, boundaries, and current architecture constraints.
- Confirm the subject is an unimplemented draft plan.
- Normalize all claims into verifiable statements.

2. Run harmfulness gate.
- Decide whether the core approach is harmful even if technically feasible.
- If harmful, flag as Critical and continue to capture secondary risks.

3. Verify objective alignment.
- Map each implementation change to an objective requirement.
- Flag missing changes, wrong changes, and unrelated changes.

4. Evaluate complexity and coupling.
- Identify new branches, abstractions, cross-module dependencies, and duplicated logic.
- Mark avoidable complexity increases as design debt.

5. Evaluate elegance and best practices.
- Check naming, API boundaries, error handling, data flow, and idiomatic language usage.
- Flag anti-patterns and overengineering.
- Skip test-coverage and missing-test concerns for draft analysis.

6. Evaluate architecture integration.
- Determine whether changes are integrated into existing abstractions or simply attached.
- Flag glue-style code paths and bypassed extension points.

7. Make refactor decision.
- Recommend refactoring when local fixes create persistent debt or architecture drift.
- Recommend targeted revision only when issues are local and structural direction is sound.

8. Produce severity-ranked findings.
- Order findings by severity first, then by architectural impact.
- Include evidence, impact, and clear recommendation for each finding.

## Severity Model
- 致命: Core direction is harmful, guarantees long-term damage, or directly contradicts the objective.
- 高: Major architecture mismatch, severe maintainability risk, or substantial wrong/missing implementation.
- 中: Noticeable complexity growth or best-practice violations with manageable scope.
- 低: Minor clarity or consistency issues without structural risk.

## Output Format
1. Findings (ordered by severity)
- For each item: Dimension, Evidence, Impact, Recommendation.

2. Open Questions and Assumptions
- List uncertainties that block high-confidence analysis.

3. Optional Conclusion
- If enough evidence exists, add a concise recommendation.
- If not enough evidence exists, skip conclusion and keep focus on findings.

## Completion Checks
- All six review dimensions are explicitly covered.
- All three principles are respected.
- Findings are severity-ranked.
- No direct code modification is performed.
- Output remains issue-focused and actionable.
