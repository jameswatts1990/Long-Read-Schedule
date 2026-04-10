# CLAUDE.md

## Purpose

This project is designed so Claude Code improves over time by learning from mistakes, poor assumptions, failed approaches, and successful patterns.

The aim is not only to complete tasks, but to build project-specific judgement. Anything that would help future work should be written down so the next task starts with better context.

Claude must treat the project’s written learnings as persistent memory for this repository.

---

## Core rule

Before making changes, and especially before creating a commit, Claude must read these files in full:

- `CLAUDE.md`
- `learnings.md`

If other files are explicitly marked as persistent guidance, those must also be read in full.

Claude must not rely on session memory when the same knowledge can be stored in the repository.

---

## Operating principles

### 1. Learn from mistakes
When Claude makes a mistake, follows an unhelpful path, makes a bad assumption, or uncovers a hidden constraint, that learning should be recorded.

Examples:
- a command that looks right but fails in this repo
- a pattern that breaks existing conventions
- a common source of flaky tests
- an assumption that repeatedly causes rework
- a reviewer expectation that is not obvious from the code alone

### 2. Learn from success
Useful working patterns should also be recorded.

Examples:
- the safest order for running checks
- the correct way to wire a new component into the project
- a reliable workflow for editing a specific part of the codebase
- an approach that matches reviewer expectations well

### 3. Prefer durable knowledge
Anything likely to matter again should be written into the repo, not left to temporary memory.

### 4. Keep learnings short and useful
Each learning should be specific, practical, and easy to apply.

Bad:
- “Be careful with tests.”

Good:
- “Run `npm test -- api` before commit when changing `src/api/`, because full test runs are slow and this catches the most common regressions.”

### 5. Record the reason when possible
A rule is more useful when the reason behind it is also captured.

### 6. Always Prioritise minimal resource utilisation
The app is deployed on a shared sever where compute units are chargeable - Including, PostGres SQL, CPU and RAM. Any changes should aim to minimise compute utilisation but not deteriorate functionality. Raise with the user if there is a conflict of these interests. 

### 7. Alert the user to database changes 
This app is hosted using Replit - replit controls the build process. As such migrations should be alerted so that the user can deploy the database changes using replit.

---

## Required workflow

### At the start of any task
Claude must:

1. Read `CLAUDE.md` fully.
2. Read `learnings.md` fully.
3. Identify any constraints, past mistakes, and preferred patterns that apply.
4. Use those learnings before making edits.

### During the task
Claude should:

1. Notice mistakes, dead ends, corrections, and surprises.
2. Decide whether they are likely to matter again.
3. Add them to `learnings.md` if they are durable and reusable.

### Before commit
Claude must:

1. Re-read `CLAUDE.md` fully.
2. Re-read `learnings.md` fully.
3. Check whether the current work repeats a known mistake.
4. Add any new durable learning discovered during the task.
5. Commit learning updates alongside the code change when relevant.

This is mandatory. The project only improves if lessons are captured before they are forgotten.

---

## File roles

### `CLAUDE.md`
Use this file for stable rules that should almost always apply, such as:
- workflow expectations
- how Claude should use project memory
- commit-time checks
- decision-making rules
- learning criteria

### `learnings.md`
Use this file for accumulated project lessons, such as:
- mistakes to avoid
- hidden constraints
- repo-specific commands
- reviewer feedback worth preserving
- subsystem quirks
- successful recurring patterns

### 'design_guidelines.md'
Use this file to make consistent design choices

### 'replit.md'
This file describes the application

Keep `CLAUDE.md` stable. Let `learnings.md` grow over time.

---

## Learning entry format

When adding to `learnings.md`, use this format:

```md
## [Short title]

- Date: YYYY-MM-DD
- Trigger: What happened?
- Learning: What should be remembered next time?
- Action: What Claude should do differently in future
- Evidence: Optional command, file path, error message, PR note, or reviewer feedback