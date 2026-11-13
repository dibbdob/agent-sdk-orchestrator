# 0003 A failure is a result, and a partial run says so

Status: accepted

## Context

After ADR 0002, a worker that hit its turn limit, ran out of budget, crashed, or replied with something
that was not a finding was filtered out of the report. The summary then described the tickets that
remained as though they were all there were. Nothing was wrong in the report; it was simply missing
whatever had failed, which is worse, because nobody would know to look.

## Decision

- **Every ticket ends with exactly one result:** `investigated`, with its checked finding, or `failed`,
  with the reason (the SDK's result subtype, such as `error_max_turns` or `error_max_budget_usd`, or
  `exception`, or `not_a_finding`) and what it cost.
- **One worker's failure does not touch another's.** The runner returns failures as values, so the pool
  carries on.
- **A run with any failure is `partial`,** and the synthesiser is given the list of tickets that were not
  investigated and told not to describe the investigation as complete.
- **A failed synthesis does not lose the findings.** The report keeps them, and its summary says why
  there is none.
- **Cost is the sum of every run,** failed ones included, since a worker that ran out of turns was paid
  for every one of them.

## Consequences

- The report's status is a fact a caller can act on: a partial run is retried for its failed tickets, not
  rerun from the beginning (see ADR 0005).
- Failed tickets are where a person is most needed, so they lead the escalation queue (ADR 0005).
