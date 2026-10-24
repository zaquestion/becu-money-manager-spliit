import { describe, expect, it } from 'vitest';
import type { SplitRule } from '@/lib/rules';
import { findRule, parseMatchValue, matchValue, ruleLabel, upsertRule } from '@/lib/rules';

const categories = [
  { id: 8, grouping: 'Food and Drink', name: 'Dining Out' },
  { id: 9, grouping: 'Food and Drink', name: 'Groceries' },
  { id: 30, grouping: 'Transportation', name: 'Car' },
];
const food: SplitRule = { match: { grouping: 'Food and Drink' }, mode: 'BY_SHARES', shares: { a: 1, b: 1, c: 1 } };
const groceries: SplitRule = { match: { category: 9 }, mode: 'EVENLY', shares: { a: 1, b: 1 } };

describe('split rules', () => {
  it('prefers a category rule over its grouping', () => {
    const rules = [food, groceries];
    expect(findRule(rules, 9, categories)).toBe(groceries);
    expect(findRule(rules, 8, categories)).toBe(food);
    expect(findRule(rules, 30, categories)).toBeUndefined();
    expect(findRule(undefined, 9, categories)).toBeUndefined();
  });

  it('replaces a rule for the same category or grouping', () => {
    const changed: SplitRule = { ...food, shares: { a: 2 } };
    expect(upsertRule([food, groceries], changed)).toEqual([groceries, changed]);
  });

  it('labels and encodes matches', () => {
    expect(ruleLabel(food.match, categories)).toBe('All Food and Drink');
    expect(ruleLabel(groceries.match, categories)).toBe('Groceries');
    expect(parseMatchValue(matchValue(food.match))).toEqual(food.match);
    expect(parseMatchValue(matchValue(groceries.match))).toEqual(groceries.match);
    expect(parseMatchValue('')).toBeUndefined();
  });
});
