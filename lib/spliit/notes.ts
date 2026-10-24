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

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function buildNotes(userNotes: string, tx: MxTransaction, addedOn: string): string {
  const bank = [tx.feed || tx.payee, tx.accountName, `${tx.credit ? '+' : ''}${money(tx.cents)}`, tx.date, tx.pending && 'pending']
    .filter(Boolean)
    .join(' · ');
  const ours = [`Added from ${BRAND} on ${addedOn}`, bank, `${guidMarker(tx.guid)} ${fingerprintMarker(tx)}`];
  const mine = userNotes.trim();
  return (mine ? [mine, '', ...ours] : ours).join('\n');
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
