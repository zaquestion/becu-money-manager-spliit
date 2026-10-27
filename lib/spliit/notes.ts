// What we write into a Spliit expense's notes and into the MX memo.
//
// The notes carry machine-readable markers so that whether a transaction is
// already in Spliit can be read back from Spliit itself: its expense search
// (groups.expenses.list `filter`) matches notes, so looking up the marker
// finds the expense.
//   [mx:TRN-…]            the MX transaction guid
//   [mx-fp:ACT-…:-1873]   account + signed cents, to spot the same charge
//                         after a pending transaction posts under a new guid
import type { MxTransaction } from '../mx/match';

export const BRAND = 'BECU Money Manager';

export const guidMarker = (guid: string) => `[mx:${guid}]`;
export const fingerprintMarker = (tx: Pick<MxTransaction, 'accountGuid' | 'cents' | 'credit'>) =>
  `[mx-fp:${tx.accountGuid}:${tx.credit ? '' : '-'}${tx.cents}]`;

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const bankLine = (tx: MxTransaction) =>
  [tx.feed || tx.payee, tx.accountName, `${tx.credit ? '+' : ''}${money(tx.cents)}`, tx.date, tx.pending && 'pending'].filter(Boolean).join(' · ');

const withUserNotes = (userNotes: string, ours: string[]) => {
  const mine = userNotes.trim();
  return (mine ? [mine, '', ...ours] : ours).join('\n');
};

export function buildNotes(userNotes: string, tx: MxTransaction, addedOn: string): string {
  return withUserNotes(userNotes, [`Added from ${BRAND} on ${addedOn}`, bankLine(tx), `${guidMarker(tx.guid)} ${fingerprintMarker(tx)}`]);
}

// One expense for several transactions (Sum and Split): a line for each, with
// its guid marker, so each shows as already in Spliit. No fingerprints: the
// expense is dated at the end of the period, too far from the charges for the
// look-alike check.
export function buildSumNotes(userNotes: string, term: string, txs: MxTransaction[], addedOn: string): string {
  const total = txs.reduce((sum, tx) => sum + (tx.credit ? -tx.cents : tx.cents), 0);
  return withUserNotes(userNotes, [
    `Added from ${BRAND} on ${addedOn}: ${txs.length} transactions matching “${term}”, ${money(total)}`,
    ...txs.map((tx) => `${bankLine(tx)} ${guidMarker(tx.guid)}`),
  ]);
}

export interface ParsedNotes {
  guids: string[];
  addedOn?: string;
}

export function parseNotes(notes: string | null | undefined): ParsedNotes {
  const text = notes ?? '';
  return {
    guids: [...text.matchAll(/\[mx:(TRN-[\w-]+)\]/g)].map((m) => m[1]!),
    addedOn: new RegExp(`Added from ${BRAND} on (\\d{4}-\\d{2}-\\d{2})`).exec(text)?.[1],
  };
}

export function spliitMemo(addedOn: string, groupName: string, url: string): string {
  return `Spliit ${addedOn} (${groupName}): ${url}`;
}

// Appends the Spliit note to whatever memo is there, once.
export function memoWithSpliit(existing: string, note: string, url: string): string {
  const memo = existing.trim();
  if (memo.includes(url)) return memo;
  return memo ? `${memo} · ${note}` : note;
}

// Local date, as the person adding it sees it.
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
