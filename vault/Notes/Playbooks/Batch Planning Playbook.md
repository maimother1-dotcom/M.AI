# Batch Planning Playbook

> How to plan a full week of work in one session, then hand it off to Claude to execute autonomously.

---

## When to use this

- Start of week planning
- You have 3+ tasks that can run independently
- You want to walk away and have everything done by the time you're back

---

## Phase 1 — Brain dump (you)

Tell Claude everything on your plate. No format needed. Just talk. Include:
- What's urgent (due today/tomorrow)
- What's important but not urgent
- Anything that's been sitting undone
- Any waiting-for items (dependencies on others)

Claude will ask clarifying questions in one batch — answer them all at once.

---

## Phase 2 — Task breakdown (Claude)

Claude breaks the brain dump into discrete tasks. Each task:
- Has one clear output ("deployed n8n workflow" not "work on automation")
- Is independent enough to run in a separate session
- Has a priority (P1/P2/P3) and a due date
- Has a one-paragraph execution brief (enough context to run autonomously)

Review the list. Approve, edit, or remove. When you're happy: "start the batch."

---

## Phase 3 — Parallel execution (Claude)

Claude opens parallel sessions for each task. Each session:
1. Reads its execution brief
2. Runs pre-flight (credentials? context? access?)
3. Builds/executes the task
4. Tests it end-to-end
5. Writes done status
6. Updates `Active Batch.md`

You get an ntfy notification when the full batch completes.

---

## Phase 4 — Review (you)

Check `Active Batch.md`. See what's done, what's blocked.
For anything blocked: Claude will have left exact instructions on what you need to provide.

---

## Rules

- **Never add vague tasks.** "Figure out the marketing" is not a task. "Write 3 LinkedIn posts for this week, based on the content calendar" is a task.
- **One output per task.** If a task has two outputs, split it.
- **Pre-flight before build.** Claude checks credentials and context before starting. If blocked, it stops and tells you exactly what you need to provide. Never waste time on something you could fix in 30 seconds.
- **Test before done.** Nothing gets marked complete without a real end-to-end test.

---

## Prompt template for starting a batch

```
Here's everything on my plate this week:

[brain dump]

Break this into tasks, prioritize them, and give me an execution plan. 
One question batch if you need clarification.
```
