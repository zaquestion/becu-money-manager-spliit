// Finds the MX transaction behind the Transaction Details drawer. The drawer
// doesn't expose the transaction's guid, so it's matched on what it shows:
// amount and date must agree; payee, bank description, account and memo
// break ties.
import type { RawTransaction } from './session';

// What the drawer shows (see lib/drawer.ts).
export interface DrawerTarget {
  cents: number; // unsigned
  date: string; // YYYY-MM-DD, as displayed
  payee: string;
  feed: string; // the bank's description under the payee
  account: string;
  memo: string;
  category: string;
}

export interface MxTransaction {
  guid: string;
  cents: number; // unsigned
  credit: boolean;
  date: string; // YYYY-MM-DD in the browser's time zone
  payee: string;
  feed: string;
  memo: string;
  accountGuid: string;
  accountName: string;
  pending: boolean; // not cleared yet: may change or be replaced when it posts
}

const CREDIT = 1; // MX transaction_type: 1 = credit, 2 = debit

const ymd = (d: Date, utc: boolean) =>
  utc
    ? d.toISOString().slice(0, 10)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function toMxTransaction(raw: RawTransaction, accountNames: Map<string, string>): MxTransaction | undefined {
  const amount = Number(raw.amount);
  const secs = Number(raw.date);
  if (!Number.isFinite(amount) || !Number.isFinite(secs)) return undefined;
  const accountGuid = str(raw.account_guid);
  return {
    guid: raw.guid,
    cents: Math.round(Math.abs(amount) * 100),
    credit: raw.transaction_type === CREDIT,
    date: ymd(new Date(secs * 1000), false),
    payee: str(raw.description),
    feed: str(raw.feed_description) || str(raw.original_description),
    memo: str(raw.memo),
    accountGuid,
    accountName: accountNames.get(accountGuid) ?? str(raw.account),
    // A bank feed transaction that hasn't posted yet. Manual ones never post.
    pending: raw.is_manual === false && raw.posted_date == null,
  };
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const same = (a: string, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

// Best matches first. Only the best-scoring ones are returned, so more than one
// means the drawer can't tell them apart.
export function matchDrawer(target: DrawerTarget, txs: Iterable<RawTransaction>, accountNames: Map<string, string>) {
  const scored: { tx: MxTransaction; score: number }[] = [];
  for (const raw of txs) {
    // Split parents are replaced in the list by their parts.
    if (raw.has_been_split === true) continue;
    const tx = toMxTransaction(raw, accountNames);
    if (!tx || tx.cents !== target.cents) continue;
    // Feed dates can sit near midnight, so allow the UTC day too.
    const utcDate = ymd(new Date(Number(raw.date) * 1000), true);
    const diff = Math.min(dayDiff(tx.date, target.date), dayDiff(utcDate, target.date));
    if (diff > 1) continue;
    const score =
      (diff === 0 ? 8 : 0) +
      (same(tx.payee, target.payee) ? 4 : 0) +
      (same(tx.accountName, target.account) ? 2 : 0) +
      (same(tx.feed, target.feed) ? 1 : 0) +
      (same(tx.memo, target.memo) || (!tx.memo && !target.memo) ? 1 : 0);
    scored.push({ tx, score });
  }
  const best = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.tx);
}
