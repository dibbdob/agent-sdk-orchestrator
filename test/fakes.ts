import type { AgentOutcome, AgentRunner, AgentSpec } from '../src/runner.ts';

/** A runner that answers from a function and records every spec it was given. */
export function fakeRunner(answer: (spec: AgentSpec) => AgentOutcome | Promise<AgentOutcome>) {
  const specs: AgentSpec[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const run: AgentRunner = async (spec) => {
    specs.push(spec);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    try {
      return await answer(spec);
    } finally {
      inFlight--;
    }
  };
  return { run, specs, maxInFlight: () => maxInFlight };
}

export const ok = (text: string, structured: unknown = undefined, costUsd = 0.01): AgentOutcome =>
  ({ ok: true, text, structured, costUsd, turns: 3, sessionId: 'session' });
