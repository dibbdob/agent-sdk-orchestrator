import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One citable item in the knowledge base: a release note, a status-page incident or a runbook step. */
export type KnowledgeItem = { id: string; source: string; text: string };

/** Each `- ID: text` bullet in data/kb/*.md becomes an item; continuation lines join it. */
export function loadKnowledge(dir = 'data/kb'): KnowledgeItem[] {
  const items: KnowledgeItem[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const start = /^- ([A-Z]+-[A-Z0-9-]+): (.*)$/.exec(line);
      const last = items.at(-1);
      if (start) {
        items.push({ id: start[1]!, source: file, text: start[2]! });
      } else if (line.startsWith('  ') && last?.source === file) {
        last.text += ` ${line.trim()}`;
      }
    }
  }

  return items;
}

/** Items that contain any of the words, most matching words first. */
export function searchKnowledge(items: KnowledgeItem[], words: string): KnowledgeItem[] {
  const terms = words.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return items
    .map((item) => ({ item, score: terms.filter((t) => item.text.toLowerCase().includes(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
