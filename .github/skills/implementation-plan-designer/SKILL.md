---
name: implementation-plan-designer
description: Design complete implementation plans for codebase changes after first checking whether the requirement is reasonable and whether it is grounded in the existing project code. Use when Codex needs to turn a feature request, refactor request, architecture adjustment, or integration change into a concrete implementation plan with goals, likely difficulties, implementation outline, exact file/line edit ranges, and full replacement code guidance.
---

# Implementation Plan Designer

## Purpose

Produce implementation plans that are codebase-aware, architecture-aware, and immediately actionable.

Do not act like a generic brainstorming assistant. Inspect the project first, then decide whether the request is technically reasonable, whether it reflects actual understanding of the current code, and whether the change should be implemented directly or preceded by refactoring.

Write the final plan as a Markdown file under `docs/` unless the user explicitly asks for a different location.

## Non-Negotiable Principles

1. Do not preserve old-version compatibility by default.
2. Prefer maintainability, elegance, and architectural fit over migration convenience.
3. Refuse vague patch-style planning when the correct answer is to refactor an existing abstraction.
4. Base every design claim on inspected code, not assumption.
5. Specify exact file targets and line ranges whenever the current code can be located precisely.
6. Provide complete change guidance without overlapping, duplicated, or missing modifications.

## Required Workflow

1. Understand the requested change.
- Restate the requirement in implementation terms.
- Identify the expected behavior, scope boundaries, and what success looks like.

2. Inspect the codebase before planning.
- Read the relevant modules, interfaces, call sites, tests, and documentation.
- Trace the current abstraction boundaries and data flow.
- Identify whether the request matches the real architecture or is based on a mistaken mental model.

3. Run the reasonableness gate.
- Judge whether the requirement itself is reasonable.
- Judge whether the requester appears to understand the current codebase.
- If the request conflicts with the architecture, duplicates existing capabilities, or asks for a harmful shortcut, say so explicitly before proposing implementation work.

4. Decide implementation versus refactor.
- Choose direct implementation only when the change fits the existing architecture cleanly.
- Choose refactor-first when the current structure cannot absorb the change without increased coupling, duplicated logic, leaky abstractions, or glue code.

5. Produce the implementation plan in the required structure.
- Always include the four required sections: `目标`, `可能的困难`, `实现大纲`, `具体实现`.
- Keep the plan concrete and file-oriented.
- Prefer grouped modifications by subsystem rather than a chronological to-do list.

6. Save the result to the repository.
- Create or update a `.md` file in `docs/`.
- Use a concise hyphen-case file name derived from the topic, for example `docs/coordinate-abstraction-integration-plan.md`.
- Treat the Markdown file as the primary deliverable, not an optional export.

## Reasonableness Gate

Before designing, answer these questions explicitly:

1. Is the requirement aligned with the project’s actual architecture and responsibilities?
2. Does the requester appear to understand the relevant existing code paths and abstractions?
3. Would implementing the request as stated create harmful complexity, compatibility burden, or architectural drift?
4. Is there a simpler or more correct direction than the one implied by the request?

If the answer to any item is negative, say so directly. Do not hide the issue inside later sections.

## Planning Standard

### 目标

- State the final technical objective in concrete terms.
- Separate user-visible outcomes from internal architectural outcomes when both matter.
- State any intentional non-goals when they prevent scope creep.

### 可能的困难

- List the hard parts that are specific to the inspected codebase.
- Focus on abstraction mismatch, shared state, event sequencing, API surface drift, type constraints, test impact, and migration risk inside the repo.
- When a difficulty indicates that the current structure is wrong, say that this part needs refactoring.

### 实现大纲

- Break the work into major change areas.
- Explain why each area exists and how it integrates with the current architecture.
- Make dependency order clear.
- Call out any deletions, interface reshaping, or responsibility moves.

### 具体实现

For each file or tightly related file group:

1. Name the file path.
2. Give the current line range to inspect or replace when it can be determined from the repository.
3. State exactly what to change.
4. Show the target code shape.
5. Explain why the result is architecturally correct.

When providing code guidance:

- Prefer full replacement blocks for the affected function, type, class, or module section.
- Do not provide partial snippets that leave hidden gaps.
- Do not repeat the same modification in multiple places unless each site genuinely needs its own change.
- If exact line numbers cannot be trusted because the file is unstable, say so and anchor the change by symbol names instead.

## Line-Range Rules

1. Use current repository line numbers after reading the file.
2. Reference stable units such as function names, exported types, classes, or sections together with the line range.
3. Do not invent ranges.
4. If one modification spans multiple adjacent units, group them into one replacement range.
5. If the code should be deleted, say `delete` explicitly instead of describing it vaguely.

## Architecture Rules

1. Integrate the change through existing extension points, abstractions, and module boundaries whenever possible.
2. Reject plans that bolt logic onto unrelated layers.
3. Reduce branching and duplication where possible.
4. Keep public APIs minimal and coherent.
5. Prefer moving responsibilities to the right layer over adding coordination glue.
6. If elegance and integration cannot be achieved within the current structure, require refactoring and explain the new ownership boundaries.

## Output Format

Use this exact structure:

````markdown
## 需求判断
- 合理性：
- 代码理解判断：
- 关键依据：

## 目标
- ...

## 可能的困难
- ...

## 实现大纲
1. ...
2. ...

## 具体实现
1. `[path/to/file]`
- 变更范围：`Lx-Ly` ...
- 修改内容：
```language
// complete target code
```
- 设计说明：
```
````

If the request should be rejected or reframed, still keep this structure, but use `实现大纲` and `具体实现` to explain the refactor-first or redesign-first path.

## Output Location Rules

1. Save the final plan in `docs/`.
2. Prefer updating an existing relevant plan file when the request is clearly a revision of that document.
3. Otherwise create a new Markdown file with a topic-specific hyphen-case name ending in `-plan.md`.
4. Keep the document self-contained so it can be reviewed without the chat transcript.
5. When the request evolves, update the same `docs` file instead of scattering multiple near-duplicate plans.

## Quality Bar

Before finishing, verify all of the following:

1. The plan explicitly judges whether the requirement is reasonable.
2. The plan explicitly judges whether the requester appears to understand the current code.
3. The plan avoids backward-compatibility preservation unless there is a strong inspected reason.
4. The plan names concrete files and line ranges wherever possible.
5. The plan provides complete code guidance for each affected unit.
6. The plan keeps complexity, maintainability, and coupling under control.
7. The plan explains when refactoring is required instead of patching.
8. The plan fits the existing architecture instead of attaching glue code.
9. The final deliverable is written to a Markdown file under `docs/`.
