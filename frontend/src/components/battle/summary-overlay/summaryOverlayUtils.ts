import type { BattleSummary } from '@/lib/battleSummary';
import { DISPLAY_LINE_ORDER } from './constants';

export function getOrderedLines(summary: BattleSummary | null) {
  if (!summary) return [];
  const linesByKey = new Map(summary.lines.map((line) => [line.key, line]));
  return DISPLAY_LINE_ORDER
    .map((key) => linesByKey.get(key))
    .filter((line): line is BattleSummary['lines'][number] => Boolean(line));
}

export function getLineLabel(_summary: BattleSummary | null, line: BattleSummary['lines'][number]) {
  return line.label;
}

export function getFinalTreeNote(summary: BattleSummary | null, loading: boolean, t: (key: string) => string) {
  if (!summary) return null;

  const injuryLine = summary.lines.find((line) => line.key === 'injury') || null;
  if (loading || (injuryLine && injuryLine.state !== 'ready')) {
    return t('battle_summary.tree_note_pending');
  }

  if (summary.injury?.branchName) {
    return t('battle_summary.tree_note_injury');
  }

  return t('battle_summary.tree_note_no_injury');
}

export function formatIntroText(text: string, marker: string) {
  if (!text) return text;

  if (marker && text.includes(marker)) {
    return text.replace(marker, `\n\n${marker.trimStart()}`);
  }

  return text;
}
