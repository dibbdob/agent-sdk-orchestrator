import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TicketResult } from './coordinator.ts';

/** Where a run keeps each ticket's result as it finishes, so a later run can pick up from it. */
export type Checkpoint = {
  load(): Map<string, TicketResult>;
  save(result: TicketResult): void;
};

/** Nothing kept: every run starts from the beginning. */
export const noCheckpoint: Checkpoint = { load: () => new Map(), save: () => {} };

/**
 * One JSON file per ticket under the run's folder. Each is written to a temporary name and renamed into
 * place, so an interruption mid-write leaves the previous file or none, never half of one.
 */
export function fileCheckpoint(dir: string): Checkpoint {
  return {
    load() {
      if (!existsSync(dir)) {
        return new Map();
      }

      const results = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as TicketResult);
      return new Map(results.map((r) => [r.ticket_id, r]));
    },
    save(result) {
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${result.ticket_id}.json`);
      writeFileSync(`${path}.tmp`, JSON.stringify(result, null, 2));
      renameSync(`${path}.tmp`, path);
    },
  };
}
