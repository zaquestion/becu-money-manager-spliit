import { describe, expect, it } from 'vitest';
import type { DrawerTarget } from '@/lib/mx/match';
import { matchDrawer, toMxTransaction } from '@/lib/mx/match';
import type { RawTransaction } from '@/lib/mx/session';

// Noon UTC, so the local date is the same day in any US time zone.
const at = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

const raw = (over: Partial<RawTransaction> & { guid: string }): RawTransaction => ({
  account_guid: 'ACT-1',
  amount: 18.73,
  date: at('2026-10-21'),
  description: 'Amazon',
  feed_description: 'AMAZON MKTPLACE PMTS',
  memo: null,
  transaction_type: 2,
  has_been_split: false,
  ...over,
});

const target: DrawerTarget = {
  cents: 1873,
  date: '2026-10-21',
  payee: 'Amazon',
  feed: 'AMAZON MKTPLACE PMTS',
  account: 'Visa',
  memo: '',
  category: 'Shopping',
};
const accounts = new Map([
  ['ACT-1', 'Visa'],
  ['ACT-2', 'Checking'],
]);

describe('matching the drawer', () => {
  it('reads an MX transaction', () => {
    expect(toMxTransaction(raw({ guid: 'TRN-1', transaction_type: 1, memo: 'x', is_manual: false, posted_date: at('2026-10-22') }), accounts)).toEqual({
      guid: 'TRN-1',
      cents: 1873,
      credit: true,
      date: '2026-10-21',
      payee: 'Amazon',
      feed: 'AMAZON MKTPLACE PMTS',
      memo: 'x',
      accountGuid: 'ACT-1',
      accountName: 'Visa',
      pending: false,
    });
    expect(toMxTransaction(raw({ guid: 'TRN-2', is_manual: false, posted_date: null }), accounts)?.pending).toBe(true);
    // Manual transactions have no posted date but never post.
    expect(toMxTransaction(raw({ guid: 'TRN-3', is_manual: true, posted_date: null }), accounts)?.pending).toBe(false);
    // Without is_manual, don't guess.
    expect(toMxTransaction(raw({ guid: 'TRN-4', posted_date: null }), accounts)?.pending).toBe(false);
  });

  it('needs the amount and a date within a day', () => {
    const txs = [raw({ guid: 'TRN-a', amount: 18.74 }), raw({ guid: 'TRN-b', date: at('2026-10-24') })];
    expect(matchDrawer(target, txs, accounts)).toEqual([]);
    expect(matchDrawer(target, [raw({ guid: 'TRN-c', date: at('2026-10-22') })], accounts).map((t) => t.guid)).toEqual(['TRN-c']);
  });

  it('breaks ties on date, payee, account and memo', () => {
    const txs = [
      raw({ guid: 'TRN-other-day', date: at('2026-10-20') }),
      raw({ guid: 'TRN-checking', account_guid: 'ACT-2' }),
      raw({ guid: 'TRN-memo', memo: 'gift' }),
      raw({ guid: 'TRN-right' }),
    ];
    expect(matchDrawer(target, txs, accounts).map((t) => t.guid)).toEqual(['TRN-right']);
  });

  it('returns every transaction it cannot tell apart', () => {
    const txs = [raw({ guid: 'TRN-1' }), raw({ guid: 'TRN-2' })];
    expect(matchDrawer(target, txs, accounts).map((t) => t.guid)).toEqual(['TRN-1', 'TRN-2']);
  });

  it('skips split parents (their parts are listed instead)', () => {
    expect(matchDrawer(target, [raw({ guid: 'TRN-p', has_been_split: true })], accounts)).toEqual([]);
  });
});
