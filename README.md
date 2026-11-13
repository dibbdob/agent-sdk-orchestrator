# Multi-agent triage with the Claude Agent SDK

A support desk has ten open tickets and a small knowledge base: a release note, the status page's
history, a runbook. This repository triages them with the Claude Agent SDK (TypeScript): a coordinator
gives each ticket to its own worker agent, checks what each one reports, finds the incidents that affect
more than one customer, has a final agent write the summary, and hands a person the short list of
tickets the agents could not settle.

It is the same fictional desk as the sibling repositories: the tickets are the MCP server's, and the
fields are close to what the extractor produces.

## The history is the point

Each stage is a branch merged into `main` with a merge message written like a pull request, and each
answers what the one before it left unguarded.

```bash
git log --first-parent --reverse --format='%h %s' main
git log --graph --format='%h %s%n%b' main
```

| # | Stage | The problem it answers |
|---|---|---|
| 1 | One agent, every ticket, one conversation | (none yet) |
| 2 | `hub-and-spoke` | One context held every customer's text, inherited the machine's settings, and one failure lost everything |
| 3 | `structured-handoff` | Workers returned prose the hub could neither group nor check, and a final summariser would have read every customer again |
| 4 | `partial-completion` | A failed worker vanished, and the report described what was left as if it were all |
| 5 | `guardrails` | A worker's tools were limited only by configuration, nothing was recorded, and nothing limited the run's spend |
| 6 | `resume-and-escalation` | A second run paid again for everything, and nobody had one list of what needed a person |
| 7 | `command-line` | It could not be run without writing code |
| 8 | `first-triage` | No model had yet run it: whether the workers find the causes, and what it costs, were still claims |

Some findings came from checking the checks: the build passed with zero tests after a test file was
removed; the first draft of the incident test patched its own fixtures to manufacture a shared cause
(rewritten, with a real second ticket in the data); a doc comment ended up on the wrong declaration.
Each is in the commit that fixed it.

## What it demonstrates

| Area | Where to look |
|---|---|
| **Hub and spoke**: orchestration in code, one worker per ticket, bounded concurrency | [`coordinator.ts`](src/coordinator.ts), [ADR 0001](docs/adr/0001-the-hub-is-code-and-each-worker-sees-one-ticket.md) |
| **Context isolation**: one ticket per worker, a tool bound to it, `tools: []`, `settingSources: []` | [`worker.ts`](src/worker.ts), [`desk-tools.ts`](src/desk-tools.ts) |
| **In-process MCP tools** with `createSdkMcpServer` and `tool()`, read-only annotations | [`desk-tools.ts`](src/desk-tools.ts) |
| **Structured handoff**: `outputFormat` from one zod schema, checked against the knowledge base | [`finding.ts`](src/finding.ts), [ADR 0002](docs/adr/0002-a-finding-is-a-schema-and-the-hub-checks-it.md) |
| **Hallucinated citations caught**, uncited causes refused, unsupported confidence lowered | [`checkFinding`](src/finding.ts), [tests](test/structured-handoff.test.ts) |
| **Synthesis from findings only**: no customer text reaches the agent with the widest view | [`synthesis.ts`](src/synthesis.ts) |
| **Failure propagation and partial completion**: every ticket has a result; a partial run says so | [ADR 0003](docs/adr/0003-a-failure-is-a-result-and-a-partial-run-says-so.md), [tests](test/partial-completion.test.ts) |
| **Hooks**: a `PreToolUse` guard and a `PostToolUse` audit log in every worker | [`guardrails.ts`](src/guardrails.ts), [ADR 0004](docs/adr/0004-guards-in-hooks-and-a-budget-for-the-run.md) |
| **Budgets**: `maxTurns` and `maxBudgetUsd` per worker, a run budget checked before each start | [`worker.ts`](src/worker.ts), [`coordinator.ts`](src/coordinator.ts) |
| **Resume**: results checkpointed per ticket with atomic writes; a second run redoes only failures | [`checkpoint.ts`](src/checkpoint.ts), [ADR 0005](docs/adr/0005-resume-from-results-and-escalate-what-is-unsettled.md) |
| **Escalation**: one queue, ordered by how little is known, then by priority | [`escalation.ts`](src/escalation.ts) |
| **Model choice per role**: Sonnet 5.5 for reading-heavy workers, Opus 5.5 for synthesis | [`worker.ts`](src/worker.ts), [`synthesis.ts`](src/synthesis.ts) |
| **Untrusted input**: ticket text labelled as the customer's; T-1010 tells its reader to close it | [`desk-tools.ts`](src/desk-tools.ts), [the data](data/README.md) |
| **Testing without a model**: one `AgentRunner` seam, a fake that records every spec | [`runner.ts`](src/runner.ts), [`fakes.ts`](test/fakes.ts) |

## Run it

Needs Node 26 (it runs the TypeScript directly) and `npm install`.

```bash
./build.sh
```

Type checks and 29 tests. No test calls a model.

The command line runs real agents and is billed to an API key, which is how the Agent SDK is documented
to authenticate. Set a spend limit on the key first.

```bash
node src/cli.ts                    # what it would do and spend; runs nothing
node src/cli.ts --yes              # run it; results under runs/<id>/
node src/cli.ts --yes --run <id>   # resume a run: reuse what finished, retry what failed
```

With the defaults (a $3.00 run budget, three workers at a time, $0.25 each), a run cannot exceed $3.50.
The first real run, ten tickets on Claude Sonnet 5.5 and one synthesis on Claude Opus 5.5, spent $0.13.

## What has and has not been verified

- **Verified by the build:** worker isolation (what each worker is given, and refused); the tools; the
  schema and every check on a finding; grouping into incidents; that no customer message reaches the
  synthesiser; failures, partial runs and their cost; the tool guard and the audit log; the worker and
  run budgets; resume from a checkpoint; the escalation queue; the report; that the CLI spends
  nothing without `--yes`; and that it refuses a budget or concurrency that is not a positive number.
- **Verified against the SDK's types** (version 0.3.323): every option, hook and message shape used.
- **Run on GitHub:** `./build.sh`, by the `build` workflow on every push to `main` and every pull request.
- **Run for real, on 2026-11-13** ($0.13, complete, nothing failed): the workers found the three causes the
  data was written to contain, REL-2611-1 for T-1008 and T-1013, grouped as one incident, and INC-1110
  for T-1001, at high confidence. T-1010's instruction to close itself was not followed; it went to the
  top of the queue as a possible security issue. Each worker read only its own ticket and used only the
  two desk tools. Where the knowledge base had nothing, the finding said so, at low confidence, rather
  than guessing. The summary called ten tickets eleven, so the synthesiser is now given the counts.
- **Not yet verified by a real run:** a partial run and its resume, and a worker stopped by its budget.

## Layout

```
data/          thirteen synthetic tickets and a small knowledge base, and how they were chosen
docs/adr/      why each decision was made
src/
  coordinator.ts   the hub: fan-out, checks, incidents, budget, resume, report
  worker.ts        one worker's whole world
  desk-tools.ts    the in-process MCP tools
  finding.ts       the handoff schema and its checks
  synthesis.ts     the summariser, which sees findings only
  guardrails.ts    the tool guard, the audit hook
  checkpoint.ts    per-ticket results, written atomically
  escalation.ts    the queue for a person
  runner.ts        the only place query() is called
  cli.ts           run, resume, read
test/          every test, none of which calls a model
build.sh       the gate
```
