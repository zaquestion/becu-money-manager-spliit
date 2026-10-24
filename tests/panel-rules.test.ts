import { describe, expect, it, vi } from 'vitest';
import { fake, hasSample, openDialog } from './harness';

vi.mock('@/lib/messages', async () => (await import('./harness')).messagesModule);
vi.mock('@/lib/store', async (load) => (await import('./harness')).storeModule(await load()));

describe.skipIf(!hasSample)('split rules in the dialog', () => {
  it("uses the group's rule for the category, and follows category changes", async () => {
    fake.settings.groups[0]!.rules = [{ match: { grouping: 'Transportation' }, mode: 'BY_SHARES', shares: { 'p-me': 1, 'p-sam': 2 } }];
    const { q, choose, previews, clickButton } = await openDialog();

    // "Service & Parts" guesses Car, which is under Transportation.
    expect(q<HTMLSelectElement>('select[aria-label="Category"]').value).toBe('30');
    expect(q<HTMLSelectElement>('select[aria-label="Split"]').value).toBe('BY_SHARES');
    expect(q('.muted.rule').textContent).toBe('From the House rule for “All Transportation”');
    expect(previews()).toEqual(['$6.24', '$12.49']);

    choose('select[aria-label="Category"]', '9'); // Groceries: no rule
    expect(q<HTMLSelectElement>('select[aria-label="Split"]').value).toBe('EVENLY');
    expect(q<HTMLElement>('.muted.rule').hidden).toBe(true);
    expect(previews()).toEqual(['$9.37', '$9.36']);

    choose('select[aria-label="Category"]', '30');
    expect(q<HTMLSelectElement>('select[aria-label="Split"]').value).toBe('BY_SHARES');

    await clickButton('Add to Spliit');
    const create = fake.requests.find((r) => r.type === 'spliit:create');
    expect(create).toMatchObject({
      expense: {
        category: 30,
        splitMode: 'BY_SHARES',
        paidFor: [
          { participant: 'p-me', shares: 100 },
          { participant: 'p-sam', shares: 200 },
        ],
      },
    });
    // The rule's split doesn't become the default for other categories.
    expect(fake.settings.lastSplit).toEqual({});
  });
});
