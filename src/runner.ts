import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

/** One agent to run: a label for logs, the prompt, and the SDK options that define it. */
export type AgentSpec = { label: string; prompt: string; options: Options };

/** How a run ended. A failure is a value, not an exception, so a coordinator can carry on without it. */
export type AgentOutcome =
  | { ok: true; text: string; structured: unknown; costUsd: number; turns: number; sessionId: string }
  | { ok: false; reason: string; detail: string; costUsd: number; turns: number; sessionId?: string };

/** The seam between orchestration and the SDK. Tests pass a fake; nothing else calls query(). */
export type AgentRunner = (spec: AgentSpec) => Promise<AgentOutcome>;

export const sdkRunner: AgentRunner = async ({ prompt, options }) => {
  let outcome: AgentOutcome | undefined;
  try {
    for await (const message of query({ prompt, options })) {
      if (message.type !== 'result') {
        continue;
      }

      outcome = message.subtype === 'success'
        ? { ok: true, text: message.result, structured: message.structured_output, costUsd: message.total_cost_usd, turns: message.num_turns, sessionId: message.session_id }
        : { ok: false, reason: message.subtype, detail: message.errors.join('; '), costUsd: message.total_cost_usd, turns: message.num_turns, sessionId: message.session_id };
    }
  } catch (error) {
    // A single-shot query throws after yielding an error result. The result, if there was one, is the
    // better account of what happened, so keep it.
    outcome ??= { ok: false, reason: 'exception', detail: String(error), costUsd: 0, turns: 0 };
  }

  return outcome ?? { ok: false, reason: 'no_result', detail: 'The query ended without a result.', costUsd: 0, turns: 0 };
};
