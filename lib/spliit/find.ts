// Is this MX transaction already in Spliit? Answered from Spliit's own data:
// search each group for the transaction's marker, then read the notes of
// what comes back to be sure it's ours.
import type { Hit } from '../messages';
import type { MxTransaction } from '../mx/match';
import type { GroupRef } from '../store';
import { expenseUrl, getExpense, searchExpenses } from './client';
import type { ParsedNotes } from './notes';
import { fingerprintMarker, guidMarker, parseNotes } from './notes';

// A pending charge and its posted replacement can be days apart.
const FINGERPRINT_DAYS = 10;

const day = (iso: string) => iso.slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export async function findInGroup(group: GroupRef, tx: MxTransaction): Promise<Hit[]> {
  const hit = (e: { id: string; title: string; amount: number; expenseDate: string }, exact: boolean, notes: ParsedNotes): Hit => ({
    origin: group.origin,
    groupId: group.id,
    groupName: group.name,
    expenseId: e.id,
    title: e.title,
    amount: e.amount,
    expenseDate: day(e.expenseDate),
    url: expenseUrl(group.origin, group.id, e.id),
    addedOn: notes.addedOn,
    mxGuids: notes.guids,
    exact,
  });

  const hits: Hit[] = [];
  for (const summary of await searchExpenses(group.origin, group.id, guidMarker(tx.guid))) {
    const expense = await getExpense(group.origin, group.id, summary.id);
    const notes = parseNotes(expense.notes);
    if (notes.guids.includes(tx.guid)) hits.push(hit(summary, true, notes));
  }

  const seen = new Set(hits.map((h) => h.expenseId));
  for (const summary of await searchExpenses(group.origin, group.id, fingerprintMarker(tx))) {
    if (seen.has(summary.id) || daysApart(day(summary.expenseDate), tx.date) > FINGERPRINT_DAYS) continue;
    const expense = await getExpense(group.origin, group.id, summary.id);
    hits.push(hit(summary, false, parseNotes(expense.notes)));
  }
  return hits;
}
