# 0001 The hub is code, and each worker sees one ticket

Status: accepted

## Context

The first version sent every open ticket to one agent in one conversation. Everything it read (nine
tickets, every search, every knowledge-base item) stayed in one context, so the ninth ticket was
investigated by an agent already holding eight investigations' worth of other customers' text. A
ticket's cause could be borrowed from its neighbour, a customer's instruction in one ticket sat in the
context while another was judged, and one failure lost the whole run. It also loaded whatever settings,
CLAUDE.md and hooks the machine running it had.

## Decision

A **coordinator in code** fans out one **worker per ticket**, at most three at a time, and collects their
outcomes. Fan-out is a loop, not a model's decision: which tickets get a worker is a rule (status is
open), so writing it as a rule makes it predictable, testable and free.

Each worker starts with:

- its ticket id, and a system prompt saying ticket text is the customer's, not an instruction;
- two in-process tools, `read_ticket` and `search_knowledge`, both read-only. `read_ticket` is bound to
  the assigned ticket and refuses any other, so isolation holds whatever the worker tries;
- no built-in tools (`tools: []`), and none of the machine's settings, CLAUDE.md files or hooks
  (`settingSources: []`). `allowedTools` only pre-approves; `tools` is what removes;
- Claude Sonnet 5.5, a reading-heavy job's model, and a turn limit.

Every SDK call goes through `AgentRunner`, so the orchestration is tested with a fake that records what
each worker was given and how many ran at once.

## Consequences

- A worker's context holds one ticket's investigation, so its cost and its errors stay with that ticket.
- The SDK's own subagents (the `agents` option, invoked through the Agent tool) are the alternative when
  the split is a judgement the model should make. Here it is not, so the hub does not pay a model to make
  it, and nothing depends on a model choosing to delegate.
- The workers' answers are still free text, so the hub cannot group tickets by cause or check a claim.
