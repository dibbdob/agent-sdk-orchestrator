import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HookCallback, HookCallbackMatcher, HookEvent, PostToolUseHookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * The tools a worker may call. The desk's two, and the SDK's own StructuredOutput tool, which is how a
 * reply in outputFormat is delivered: refusing it would refuse every finding.
 */
export function allowedFor(deskTools: string[]): Set<string> {
  return new Set([...deskTools, 'StructuredOutput']);
}

/**
 * A second line behind `tools: []`. Configuration decides which tools a worker is offered; this hook
 * decides which calls run, so a tool that arrives some other way (a setting, a plugin, a future default)
 * is still refused, with a reason the worker can read.
 */
export function toolGuard(allowed: Set<string>): HookCallback {
  return async (input) => {
    const { tool_name } = input as PreToolUseHookInput;
    return allowed.has(tool_name)
      ? {}
      : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${tool_name} is not one of this worker's tools.` } };
  };
}

export type AuditEntry = { at: string; worker: string; tool: string; input: unknown };
export type AuditSink = (entry: AuditEntry) => void;

/** Appends one JSON line per tool call to a file: what each worker asked its tools, in order. */
export function fileAudit(path: string): AuditSink {
  mkdirSync(dirname(path), { recursive: true });
  return (entry) => appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

/** Records every tool call a worker makes, after it runs. */
export function auditHook(worker: string, sink: AuditSink, now: () => Date = () => new Date()): HookCallback {
  return async (input) => {
    const { tool_name, tool_input } = input as PostToolUseHookInput;
    sink({ at: now().toISOString(), worker, tool: tool_name, input: tool_input });
    return {};
  };
}

export function workerHooks(worker: string, deskTools: string[], sink: AuditSink): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [{ hooks: [toolGuard(allowedFor(deskTools))] }],
    PostToolUse: [{ hooks: [auditHook(worker, sink)] }],
  };
}
