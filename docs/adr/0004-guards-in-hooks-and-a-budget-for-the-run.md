# 0004 Guards in hooks, and a budget for the run

Status: accepted

## Context

A worker's tools were limited by configuration alone: `tools: []` removed the built-ins and the desk
server offered two. Configuration says what a worker is offered; it does not say what a call is allowed
to do when it arrives, and a tool can arrive some other way (a setting, a plugin, a default that changes
between SDK releases). Nothing recorded what a worker had asked its tools, so a surprising finding could
not be traced to the searches behind it. Each worker had a turn limit and nothing else; nothing limited
what the whole run spent.

## Decision

- **A `PreToolUse` hook in every worker refuses any tool outside its allowance,** with a reason the
  worker can read. The allowance is the two desk tools plus `StructuredOutput`, the SDK's own tool for
  delivering an `outputFormat` reply; refusing it would refuse every finding.
- **A `PostToolUse` hook records every call** (time, worker, tool, input) to an audit sink, a JSON-lines
  file in a real run.
- **Each worker has a budget** (`maxBudgetUsd`, $0.25). The SDK stops a worker that reaches it with
  `error_max_budget_usd`, which becomes a failed result (ADR 0003).
- **The run has a budget** ($3 by default). The coordinator checks it before starting each worker and,
  once it is reached, starts no more: those tickets fail as `run_budget_spent`. The synthesis is given
  what is left, and is not run if nothing is.

## Consequences

- A worker's reach is limited twice, by configuration and by the hook, and the hook is tested on its
  own with calls it should allow and refuse.
- The run can overshoot its budget by what the workers already in flight spend, at most one worker's
  budget each: three in flight at $0.25 is $0.75. The check is before a start because a running worker
  cannot be charged for less than it has used.
- A partial run caused by the budget is visible as such, ticket by ticket, so raising the budget and
  resuming (ADR 0005) is a decision with numbers behind it.
