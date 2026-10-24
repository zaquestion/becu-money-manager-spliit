// Per-group split rules by Spliit category: "anything under Food and Drink is
// split by shares, one each". A rule for one category beats a rule for its
// whole grouping. Rules only cover splits that make sense for any amount.
import type { Category } from './spliit/client';

export type RuleMode = 'EVENLY' | 'BY_SHARES';
export type RuleMatch = { category: number } | { grouping: string };

export interface SplitRule {
  match: RuleMatch;
  mode: RuleMode;
  shares: Record<string, number>; // participant id -> shares (1 each for EVENLY); who's included
}

export function findRule(rules: SplitRule[] | undefined, categoryId: number, categories: Category[]): SplitRule | undefined {
  if (!rules?.length) return undefined;
  const grouping = categories.find((c) => c.id === categoryId)?.grouping;
  return (
    rules.find((r) => 'category' in r.match && r.match.category === categoryId) ??
    rules.find((r) => 'grouping' in r.match && r.match.grouping === grouping)
  );
}

export const sameMatch = (a: RuleMatch, b: RuleMatch) =>
  'category' in a ? 'category' in b && a.category === b.category : 'grouping' in b && a.grouping === b.grouping;

// Adds the rule, replacing one for the same category or grouping.
export const upsertRule = (rules: SplitRule[] | undefined, rule: SplitRule) => [
  ...(rules ?? []).filter((r) => !sameMatch(r.match, rule.match)),
  rule,
];

export function ruleLabel(match: RuleMatch, categories: Category[]): string {
  if ('grouping' in match) return `All ${match.grouping}`;
  return categories.find((c) => c.id === match.category)?.name ?? `Category ${match.category}`;
}

// For a <select>: "g:Food and Drink" or "c:9".
export const matchValue = (match: RuleMatch) => ('grouping' in match ? `g:${match.grouping}` : `c:${match.category}`);
export const parseMatchValue = (value: string): RuleMatch | undefined =>
  value.startsWith('g:') ? { grouping: value.slice(2) } : value.startsWith('c:') ? { category: Number(value.slice(2)) } : undefined;
