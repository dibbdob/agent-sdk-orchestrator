# 0005 Resume from results, and escalate what is unsettled

Status: accepted

## Context

A partial run (ADR 0003) and a run stopped by its budget (ADR 0004) both left a desk with some tickets
investigated and some not. Running again started from nothing and paid again for every ticket already
done. An interrupted process lost everything.

The report also left the reader to work out who needed a person: a failure was in one list, a
`needs_human` flag inside a finding, a corrected citation in a finding's checks, a low confidence in
another field.

## Decision

- **Each ticket's result is saved as soon as it finishes,** one file per ticket in the run's folder,
  written to a temporary name and renamed, so an interruption leaves the previous file or none. A run
  given the same checkpoint reuses every investigated ticket and tries the failed ones again. The report
  says how many were reused, and its cost is what this run spent.
- **The report carries an escalation queue,** the one list a person works from, ordered by how little is
  known: not investigated, then a person asked for, then a finding the hub had to correct, then low
  confidence; by the ticket's priority within each. A confident, uncorrected finding does not escalate.

The SDK's own session resume (`resume` with a session id) continues one conversation. It is not used
here: a worker's conversation is cheap to redo and has no value once its finding is saved, so the
checkpoint is the finding, not the session.

## Consequences

- Retrying a partial run costs only its failures.
- The queue is short by design. A queue holding every ticket would be read by nobody; one holding only
  what the agents could not settle is the reason to run them.
- The checkpoint trusts what it saved. A finding checked under older rules is reused as it was; changing
  the checks means starting a new run folder.
