import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpliitError, createExpense, getGroup, parseGroupLink, searchExpenses } from '@/lib/spliit/client';
import { findInGroup } from '@/lib/spliit/find';
import { buildNotes } from '@/lib/spliit/notes';
import { tx } from './fixtures';

const ORIGIN = 'https://spliit.app';
const ok = (json: unknown) => new Response(JSON.stringify({ result: { data: { json } } }), { status: 200 });

function mockFetch(handler: (url: URL, init?: RequestInit) => Response) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Spliit client', () => {
  it('sends queries as GET with a superjson input', async () => {
    const calls = mockFetch(() => ok({ expenses: [] }));
    await searchExpenses(ORIGIN, 'grp', '[mx:TRN-1]');
    expect(calls[0]!.url.pathname).toBe('/api/trpc/groups.expenses.list');
    expect(JSON.parse(calls[0]!.url.searchParams.get('input')!)).toEqual({ json: { groupId: 'grp', filter: '[mx:TRN-1]', limit: 20 } });
  });

  it('creates an expense the way the Spliit form does', async () => {
    const calls = mockFetch(() => ok({ expenseId: 'exp1' }));
    const id = await createExpense(
      ORIGIN,
      'grp',
      {
        expenseDate: '2026-10-21',
        title: 'Amazon',
        category: 0,
        amount: 1873,
        paidBy: 'me',
        paidFor: [{ participant: 'me', shares: 100 }],
        splitMode: 'EVENLY',
        notes: 'n',
      },
      'me',
    );
    expect(id).toBe('exp1');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      json: {
        groupId: 'grp',
        participantId: 'me',
        expenseFormValues: {
          expenseDate: '2026-10-21T00:00:00.000Z',
          title: 'Amazon',
          category: 0,
          amount: 1873,
          paidBy: 'me',
          paidFor: [{ participant: 'me', shares: 100 }],
          splitMode: 'EVENLY',
          notes: 'n',
          saveDefaultSplittingOptions: false,
          isReimbursement: false,
          documents: [],
          recurrenceRule: 'NONE',
        },
      },
      meta: { values: { 'expenseFormValues.expenseDate': ['Date'] } },
    });
  });

  it('surfaces tRPC errors', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ error: { json: { message: 'Invalid group ID: x', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } } }), {
          status: 500,
        }),
    );
    const err = await searchExpenses(ORIGIN, 'x', 'f').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpliitError);
    expect(err).toMatchObject({ message: 'Invalid group ID: x', status: 500, code: 'INTERNAL_SERVER_ERROR' });
  });

  it('treats a missing group as an error', async () => {
    mockFetch(() => ok({ group: null }));
    await expect(getGroup(ORIGIN, 'nope')).rejects.toThrow(/doesn’t exist/);
  });

  it('parses group links', () => {
    expect(parseGroupLink('https://spliit.app/groups/aB3_x-9/expenses?ref=share')).toEqual({ origin: ORIGIN, groupId: 'aB3_x-9' });
    expect(parseGroupLink(' http://localhost:3000/groups/abc ')).toEqual({ origin: 'http://localhost:3000', groupId: 'abc' });
    expect(parseGroupLink('https://spliit.app/groups/create')).toBeUndefined();
    expect(parseGroupLink('spliit.app/groups/abc')).toBeUndefined();
  });
});

describe('finding a transaction in Spliit', () => {
  const group = { origin: ORIGIN, id: 'grp', name: 'House' };
  const expense = (id: string, date: string, notes: string) => ({ id, title: 'Amazon', amount: 1873, expenseDate: `${date}T00:00:00.000Z`, paidBy: { id: 'me', name: 'Me' }, notes });

  it('confirms marker matches by reading the notes, and lists look-alikes', async () => {
    const ours = expense('e1', '2026-10-21', buildNotes('', tx, '2026-10-23'));
    const pending = expense('e2', '2026-10-19', buildNotes('', { ...tx, guid: 'TRN-old' }, '2026-10-19'));
    const titleOnly = expense('e3', '2026-10-21', `about ${tx.guid}`); // search hit on the title, not our marker
    const old = expense('e4', '2026-08-01', buildNotes('', { ...tx, guid: 'TRN-ancient' }, '2026-08-01'));
    const byId = new Map([ours, pending, titleOnly, old].map((e) => [e.id, e]));
    mockFetch((url) => {
      const input = JSON.parse(url.searchParams.get('input')!).json;
      if (url.pathname.endsWith('groups.expenses.get')) return ok({ expense: byId.get(input.expenseId) });
      if (input.filter.startsWith('[mx:')) return ok({ expenses: [ours, titleOnly] });
      return ok({ expenses: [ours, pending, old] });
    });
    const hits = await findInGroup(group, tx);
    expect(hits.map((h) => [h.expenseId, h.exact, h.addedOn, h.mxGuids])).toEqual([
      ['e1', true, '2026-10-23', [tx.guid]],
      ['e2', false, '2026-10-19', ['TRN-old']],
    ]);
    expect(hits[0]!.url).toBe('https://spliit.app/groups/grp/expenses/e1/edit');
    expect(hits[0]!.expenseDate).toBe('2026-10-21');
  });
});
