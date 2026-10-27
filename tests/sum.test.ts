import { describe, expect, it, vi } from 'vitest';
import { dateRange, readRow } from '@/lib/list';
import { matchRows } from '@/lib/mx/match';
import type { RawTransaction } from '@/lib/mx/session';
import { buildSumNotes, parseNotes } from '@/lib/spliit/notes';
import { endOfMonth } from '@/lib/panel';
import { tx } from './fixtures';
import { fake, fakeMain, flush } from './harness';

vi.mock('@/lib/messages', async () => (await import('./harness')).messagesModule);
vi.mock('@/lib/store', async (load) => (await import('./harness')).storeModule(await load()));

// Shaped like Money Manager's Transactions tab: its search bar and the list,
// whose rows are buttons labelled with what they show.
const row = (top: number, date: string, amount: string) => `
  <div role="row" style="height: 46px; position: absolute; top: ${top}px; width: 100%;">
    <button aria-label="New Transaction, Date: ${date}, Payee: Sprouts Market, Category: Groceries, Account: 1234 * Spending, Amount: ${amount}" data-testid="transaction-list-row" role="gridcell">
      <div>Sep</div>
      <div><h2 title="Sprouts Market">Sprouts Market</h2></div>
      <div data-testid="transaction-category-cell"><span>Groceries</span></div>
      <div><div>1234 * Spending</div></div>
      <div data-testid="transaction-amount-cell"><span data-testid="credit-debit-amount">${amount}</span></div>
    </button>
  </div>`;

const PAGE = `
  <div class="mx-date-range-picker">
    <button aria-haspopup="true" aria-label="Select A Date RangeSeptember 1st, 2026 to September 30th, 2026 currently selected">
      <div class="mx-date-range-picker-selected-date-text"><div><span>Sep 1, 2026</span><span> - </span><span>Sep 30, 2026</span></div></div>
    </button>
  </div>
  <div data-testid="search-bar" style="display: flex;">
    <div style="display: flex; height: 40px; width: 90%;">
      <div><input aria-label="Search Transactions" placeholder="Search Transactions" value="sprouts"></div>
      <button aria-label="Clear Search"></button>
    </div>
  </div>
  <div aria-label="transactions list" role="grid" style="overflow: auto; height: 533px;">
    <div role="rowgroup">
      ${row(0, 'September 26th, 2026', '$111.92')}
      ${row(46, 'September 21st, 2026', '$35.60')}
      ${row(92, 'September 21st, 2026', '$35.60')}
      ${row(138, 'September 9th, 2026', '$294.33')}
      ${row(184, 'September 2nd, 2026', '$12.00')}
    </div>
  </div>`;

const at = (day: string) => Date.parse(`2026-09-${day}T12:00:00Z`) / 1000;
const raw = (guid: string, day: string, amount: number): RawTransaction => ({
  guid,
  account_guid: 'ACT-1',
  amount,
  date: at(day),
  description: 'Sprouts Market',
  memo: '',
  transaction_type: 2,
  is_manual: false,
  posted_date: at(day),
});
// The Sep 2 row isn't among the loaded transactions.
const TXS = [raw('TRN-a', '26', 111.92), raw('TRN-b', '21', 35.6), raw('TRN-c', '21', 35.6), raw('TRN-d', '09', 294.33)];
const NAMES = new Map([['ACT-1', '1234 * Spending']]);

describe('Sum and Split', () => {
  it('reads a list row', () => {
    document.body.innerHTML = PAGE;
    expect(readRow(document.querySelector('[data-testid="transaction-list-row"]')!)).toEqual({
      cents: 11192,
      date: '2026-09-26',
      payee: 'Sprouts Market',
      feed: '',
      account: '1234 * Spending',
      memo: '',
      category: 'Groceries',
    });
  });

  it('reads the date filter', () => {
    document.body.innerHTML = PAGE;
    expect(dateRange()).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    // From the button's label if the text can't be read.
    document.querySelector('.mx-date-range-picker-selected-date-text')!.remove();
    expect(dateRange()).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('matches look-alike rows to different transactions', () => {
    const target = { cents: 3560, date: '2026-09-21', payee: 'Sprouts Market', feed: '', account: '1234 * Spending', memo: '', category: '' };
    const missing = { ...target, cents: 1200 };
    expect(matchRows([target, target, missing], TXS, NAMES).map((t) => t?.guid ?? null)).toEqual(['TRN-b', 'TRN-c', null]);
  });

  it('lists each transaction with its marker', () => {
    const notes = buildSumNotes('', 'sprouts', [tx, { ...tx, guid: 'TRN-2', cents: 500, credit: true }], '2026-10-26');
    expect(notes.split('\n')).toEqual([
      'Added from BECU Money Manager on 2026-10-26: 2 transactions matching “sprouts”, $13.73',
      `AMAZON MKTPLACE PMTS · Amazon Prime Rewards Visa Signature · $18.73 · 2026-10-21 [mx:${tx.guid}]`,
      'AMAZON MKTPLACE PMTS · Amazon Prime Rewards Visa Signature · +$5.00 · 2026-10-21 [mx:TRN-2]',
    ]);
    expect(parseNotes(notes)).toEqual({ guids: [tx.guid, 'TRN-2'], addedOn: '2026-10-26' });
  });

  it('dates the expense at the end of the month', () => {
    expect(endOfMonth('2026-09-26')).toBe('2026-09-30');
    expect(endOfMonth('2028-02-03')).toBe('2028-02-29');
    expect(endOfMonth('2026-12-31')).toBe('2026-12-31');
  });

  it('sums the listed transactions into one expense', async () => {
    fakeMain(TXS, NAMES);
    fake.inSpliit.add('TRN-d');
    document.body.innerHTML = PAGE.replace('Sep 30, 2026', 'Sep 28, 2026');
    const { mountPanel } = await import('@/lib/panel');
    mountPanel();

    const button = document.querySelector<HTMLButtonElement>('[data-becu-mx-spliit-sum]')!;
    expect(button.textContent).toBe('Sum and Split');
    expect(button.previousElementSibling!.getAttribute('style')).toContain('calc(90% - 152px)');
    button.click();
    await flush();
    await flush();

    const shadow = document.getElementById('becu-mx-spliit')!.shadowRoot!;
    const q = <T extends Element>(sel: string) => shadow.querySelector<T>(sel)!;
    expect(q('header h2').textContent).toBe('Sum and Split');
    const checks = [...shadow.querySelectorAll<HTMLInputElement>('.items input[type="checkbox"]')];
    expect(checks.map((c) => c.checked)).toEqual([true, true, true, false]); // Sep 9 is already in Spliit
    expect(q('.items').textContent).toContain('✓ In Spliit');
    expect(shadow.textContent).toContain("1 listed transaction couldn't be found");
    expect(q<HTMLInputElement>('input[aria-label="Title"]').value).toBe('Sprouts');
    expect(q<HTMLInputElement>('input[aria-label="Amount"]').value).toBe('183.12');
    expect(q<HTMLInputElement>('input[aria-label="Date"]').value).toBe('2026-09-28'); // the filter's last day
    expect(q<HTMLSelectElement>('select[aria-label="Category"]').value).toBe('9');

    // Leaving one out takes it off the total.
    checks[0]!.click();
    await flush();
    expect(q<HTMLInputElement>('input[aria-label="Amount"]').value).toBe('71.20');

    [...shadow.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add to Spliit')!.click();
    await flush();
    await flush();

    const create = fake.requests.find((r) => r.type === 'spliit:create');
    expect(create).toMatchObject({ expense: { title: 'Sprouts', amount: 7120, expenseDate: '2026-09-28', category: 9 } });
    const notes = create?.type === 'spliit:create' ? create.expense.notes : '';
    expect(parseNotes(notes).guids).toEqual(['TRN-b', 'TRN-c']);
    expect(fake.memos.map((m) => m.op === 'setMemo' && m.guid)).toEqual(['TRN-b', 'TRN-c']);
    expect(q('.callout.ok').textContent).toContain('Added to House');
    expect(shadow.textContent).toContain('2 memos updated');
  });
});
