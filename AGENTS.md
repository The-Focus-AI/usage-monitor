# Usage Monitor — Agent Workflow

This project uses GitHub issues as the source of truth for all work. Agents
read, claim, build, and close issues following this workflow.

## Issue lifecycle

```
OPEN / READY-FOR-AGENT  →  AGENT-WORKING  →  [commit + PR]  →  CLOSED
```

### States

| Label             | Meaning                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `ready-for-agent` | Issue is well-defined, has acceptance criteria, and an agent can pick it up. |
| `agent-working`   | An agent has claimed this issue and is actively building it.                 |
| _(no label)_      | Default — needs triage or human decision before an agent can start.          |

### Labels used

- `ready-for-agent` — ready for an agent to pick up
- `agent-working` — currently being worked on by an agent
- `bug` — something isn't working
- `enhancement` — new feature or request
- `documentation` — docs improvements

## Workflow

### 1. Discover what to build

Start by checking GitHub issues:

```
gh issue list --label "ready-for-agent" --state open
```

Read the full body and comments of each candidate issue. If issues declare
dependencies (via "Blocked by" in the body), build the dependency graph and
pick the most impactful unblocked issue to work on next.

Only pick up issues with the `ready-for-agent` label. Do not pick up issues
that are unlabeled, still open for triage, or marked with `bug`/`enhancement`
without the `ready-for-agent` label — those need human review first.

### 2. Claim the issue

Mark the issue as being worked on:

```
gh issue edit <number> --add-label "agent-working" --remove-label "ready-for-agent"
```

### 3. Build it (TDD)

Write tests first, then implement. Follow the testing conventions in the
project's CLAUDE.md and PRD. Every module gets tests before code.

### 4. Commit

After implementation is complete, stage and commit:

```
git add -A
git commit -m "description of what was built"
```

Do NOT push yet.

### 5. Validate with the user

Present the work to the user:

- What was built (summary)
- Test results
- Any design decisions made along the way
- Ask: "Is this ready to push?"

### 6. Push and close

If the user confirms, push and close:

```
git push
gh issue close <number>
```

The commit message should reference the issue it closes:

```
git commit -m "Implement X

Closes #<issue-number>"
```
