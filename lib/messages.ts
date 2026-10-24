// Messages from the Money Manager content script and the settings page to
// the background worker, which makes the Spliit requests.
import { browser } from 'wxt/browser';
import type { MxTransaction } from './mx/match';
import type { Category, NewExpense, SpliitGroup } from './spliit/client';
import type { GroupRef } from './store';

// An expense in Spliit that came from this MX transaction (exact), or that
// looks like it came from the same charge before it posted (possible).
export interface Hit {
  origin: string;
  groupId: string;
  groupName: string;
  expenseId: string;
  title: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  url: string;
  addedOn?: string;
  mxGuids: string[]; // the MX transactions its notes name
  exact: boolean;
}

export interface FindResult {
  hits: Hit[];
  errors: { groupName: string; error: string }[];
}

export type Request =
  | { type: 'spliit:group'; origin: string; groupId: string }
  | { type: 'spliit:categories'; origin: string }
  | { type: 'spliit:find'; groups: GroupRef[]; tx: MxTransaction; fresh?: boolean }
  | { type: 'spliit:create'; group: GroupRef; expense: NewExpense; tx: MxTransaction }
  | { type: 'options:open'; addLink?: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; needsPermission?: string };

export interface Created {
  expenseId: string;
  url: string;
  // False when the new expense can't be found again by its marker (a Spliit
  // version whose search doesn't cover notes): duplicates won't be detected.
  findable: boolean;
}

export type Responses = {
  'spliit:group': SpliitGroup;
  'spliit:categories': Category[];
  'spliit:find': FindResult;
  'spliit:create': Created;
  'options:open': null;
};

export async function ask<K extends Request['type']>(request: Extract<Request, { type: K }>): Promise<Result<Responses[K]>> {
  try {
    return await browser.runtime.sendMessage(request);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
