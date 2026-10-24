// Runs the real dialog against the saved drawer, with the background worker,
// extension storage and Money Manager's MAIN world faked. Test files wire it
// in with:
//   vi.mock('@/lib/messages', async () => (await import('./harness')).messagesModule);
//   vi.mock('@/lib/store', async (load) => (await import('./harness')).storeModule(await load()));
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { Call } from '@/lib/bridge';
import { serveBridge } from '@/lib/bridge';
import type { Request } from '@/lib/messages';
import { matchDrawer } from '@/lib/mx/match';
import type { RawTransaction } from '@/lib/mx/session';
import type * as Store from '@/lib/store';
import type { Settings } from '@/lib/store';

export const sample = join(import.meta.dirname, '..', 'samples', 'transaction_details.html');
export const hasSample = existsSync(sample);

export const fake = {
  requests: [] as Request[],
  memos: [] as Call[],
  created: false,
  settings: {
    groups: [{ origin: 'https://spliit.app', id: 'grp', name: 'House', me: 'p-me' }],
    writeMemo: true,
    lastSplit: {},
    categories: {},
  } as Settings,
};

const EXPENSE_URL = 'https://spliit.app/groups/grp/expenses/e1/edit';

export const messagesModule = {
  ask: async (request: Request) => {
    fake.requests.push(request);
    switch (request.type) {
      case 'spliit:group':
        return {
          ok: true,
          value: {
            id: 'grp',
            name: 'House',
            currency: '$',
            currencyCode: 'USD',
            participants: [
              { id: 'p-me', name: 'Me' },
              { id: 'p-sam', name: 'Sam' },
            ],
          },
        };
      case 'spliit:categories':
        return {
          ok: true,
          value: [
            { id: 0, grouping: 'Uncategorized', name: 'General' },
            { id: 9, grouping: 'Food and Drink', name: 'Groceries' },
            { id: 30, grouping: 'Transportation', name: 'Car' },
          ],
        };
      case 'spliit:find':
        return {
          ok: true,
          value: {
            errors: [],
            hits: fake.created
              ? [{ origin: 'https://spliit.app', groupId: 'grp', groupName: 'House', expenseId: 'e1', title: 'Amazon', amount: 1873, expenseDate: '2026-10-21', url: EXPENSE_URL, addedOn: '2026-10-23', mxGuids: ['TRN-1'], exact: true }]
              : [],
          },
        };
      case 'spliit:create':
        fake.created = true;
        return { ok: true, value: { expenseId: 'e1', url: EXPENSE_URL, findable: true } };
    }
    return { ok: true, value: null };
  },
};

export const storeModule = (real: typeof Store) => ({
  ...real,
  loadSettings: async () => structuredClone(fake.settings),
  saveSettings: async (changes: Partial<Settings>) => void (fake.settings = { ...fake.settings, ...changes }),
});

export const flush = () => new Promise((r) => setTimeout(r, 20));

// Mounts the dialog over the saved drawer and opens it.
export async function openDialog() {
  // happy-dom's postMessage doesn't deliver under vitest; send what a browser would.
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window })));
  });
  // The MAIN world side, with one loaded transaction.
  const txs: RawTransaction[] = [
    { guid: 'TRN-1', account_guid: 'ACT-1', amount: 18.73, date: Date.parse('2026-10-21T12:00:00Z') / 1000, description: 'Amazon', feed_description: 'AMAZON MKTPLACE PMTS', memo: '(item name)', transaction_type: 2, is_manual: false, posted_date: null },
  ];
  serveBridge(
    () => ({ hasSession: true, transactionCount: txs.length }),
    (call) => {
      if (call.op === 'match') return matchDrawer(call.target, txs, new Map([['ACT-1', 'Amazon Prime Rewards Visa Signature']]));
      if (call.op === 'loaded') return [];
      fake.memos.push(call);
    },
  );

  document.body.innerHTML = readFileSync(sample, 'utf8');
  const { mountPanel } = await import('@/lib/panel');
  mountPanel();
  await flush();
  const button = document.querySelector<HTMLButtonElement>('[data-becu-mx-spliit] button')!;
  const labelBefore = button.textContent;
  button.click();
  await flush();
  const shadow = document.getElementById('becu-mx-spliit')!.shadowRoot!;
  const q = <T extends Element>(sel: string) => shadow.querySelector<T>(sel)!;
  const clickButton = async (text: string) => {
    [...shadow.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!.click();
    await flush();
  };
  const choose = (sel: string, value: string) => {
    const select = q<HTMLSelectElement>(sel);
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const previews = () => [...shadow.querySelectorAll('td.share')].map((td) => td.textContent);
  return { button, labelBefore, shadow, q, clickButton, choose, previews };
}
