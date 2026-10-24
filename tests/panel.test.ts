import { describe, expect, it, vi } from 'vitest';
import { fake, hasSample, openDialog } from './harness';

vi.mock('@/lib/messages', async () => (await import('./harness')).messagesModule);
vi.mock('@/lib/store', async (load) => (await import('./harness')).storeModule(await load()));

describe.skipIf(!hasSample)('Add to Spliit dialog', () => {
  it('adds the transaction, writes the memo and shows it as added', async () => {
    const { button, labelBefore, shadow, q, clickButton, previews } = await openDialog();
    expect(labelBefore).toBe('Add to Spliit');
    expect(q('.tx .payee').textContent).toBe('Amazon');
    expect(q('.callout.warn').textContent).toMatch(/still pending/);
    expect(q<HTMLInputElement>('input[aria-label="Title"]').value).toBe('Amazon');
    expect(q<HTMLInputElement>('input[aria-label="Amount"]').value).toBe('18.73');
    expect(q<HTMLSelectElement>('select[aria-label="Category"]').value).toBe('30'); // Service & Parts -> Car
    expect(q<HTMLSelectElement>('select[aria-label="Paid by"]').value).toBe('p-me');
    expect(previews()).toEqual(['$9.37', '$9.36']);

    await clickButton('Add to Spliit');

    const create = fake.requests.find((r) => r.type === 'spliit:create');
    expect(create).toMatchObject({
      group: { id: 'grp', me: 'p-me' },
      expense: {
        expenseDate: '2026-10-21',
        title: 'Amazon',
        amount: 1873,
        category: 30,
        paidBy: 'p-me',
        splitMode: 'EVENLY',
        paidFor: [
          { participant: 'p-me', shares: 100 },
          { participant: 'p-sam', shares: 100 },
        ],
      },
    });
    expect(create?.type === 'spliit:create' && create.expense.notes).toContain('[mx:TRN-1]');
    expect(fake.memos).toEqual([
      { op: 'setMemo', guid: 'TRN-1', memo: expect.stringMatching(/^\(item name\) · Spliit \d{4}-\d{2}-\d{2} \(House\): https:\/\/spliit\.app\/groups\/grp\/expenses\/e1\/edit$/) },
    ]);
    expect(q('.callout.ok').textContent).toContain('Added to House');
    expect(shadow.querySelector('.callout.warn')).toBeNull(); // the pending warning is for before adding
    expect(button.textContent).toBe('✓ In Spliit');
    expect(fake.settings.lastSplit['https://spliit.app grp']).toEqual({ mode: 'EVENLY', participants: ['p-me', 'p-sam'] });
    expect(fake.settings.categories['service & parts']).toBe(30);
  });
});
