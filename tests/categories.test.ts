import { describe, expect, it } from 'vitest';
import { guessCategory } from '@/lib/spliit/categories';

const categories = [
  { id: 0, grouping: 'Uncategorized', name: 'General' },
  { id: 8, grouping: 'Food and Drink', name: 'Dining Out' },
  { id: 9, grouping: 'Food and Drink', name: 'Groceries' },
  { id: 30, grouping: 'Transportation', name: 'Car' },
];

describe('category guess', () => {
  it('matches names, then aliases', () => {
    expect(guessCategory('Groceries', categories)).toBe(9);
    expect(guessCategory('Restaurants', categories)).toBe(8);
    expect(guessCategory('Service & Parts', categories)).toBe(30);
    expect(guessCategory('Shopping', categories)).toBeUndefined();
    expect(guessCategory('', categories)).toBeUndefined();
  });
});
