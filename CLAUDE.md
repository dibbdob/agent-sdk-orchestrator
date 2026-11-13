# Ticketdesk triage

Triages a support desk's open tickets with the Claude Agent SDK (TypeScript, run directly by Node 26 with
type stripping; `tsc` checks types). Node's built-in test runner.

## Build

```bash
./build.sh
```

The build never calls a model.

## Conventions

- `data/` is synthetic. Ticket text is customer-written; T-1010 contains an instruction aimed at its reader.
- Only erasable TypeScript (no enums, no parameter properties), so Node can run it without a build step.
