// Spliit's tRPC API (src/trpc/routers in spliit-app/spliit), called the way
// its own client does with tRPC v11's non-batched http link and superjson:
//   GET  /api/trpc/<path>?input={"json":…}
//   POST /api/trpc/<path>   {"json":…,"meta":…}
// Spliit has no accounts; anyone with a group's id can use it.
// Runs in the background worker, whose host permissions get past CORS.

export interface Participant {
  id: string;
  name: string;
}

export interface SpliitGroup {
  id: string;
  name: string;
  currency: string; // symbol, e.g. "$"
  currencyCode: string | null;
  participants: Participant[];
}

export interface Category {
  id: number;
  grouping: string;
  name: string;
}

export interface ExpenseSummary {
  id: string;
  title: string;
  amount: number; // minor units
  expenseDate: string; // ISO
  paidBy: Participant;
}

export interface Expense extends ExpenseSummary {
  notes: string | null;
}

export interface NewExpense {
  expenseDate: string; // YYYY-MM-DD
  title: string;
  category: number;
  amount: number; // minor units; negative for a refund
  paidBy: string;
  paidFor: { participant: string; shares: number }[];
  splitMode: 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT';
  notes: string;
}

export class SpliitError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
  }
}

interface Envelope {
  result?: { data?: { json?: unknown } };
  error?: { json?: { message?: string; data?: { code?: string; httpStatus?: number } } };
}

async function unwrap<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: Envelope;
  try {
    body = JSON.parse(text) as Envelope;
  } catch {
    throw new SpliitError(`Spliit said HTTP ${response.status}: ${text.slice(0, 200)}`, response.status);
  }
  if (body.error || !response.ok) {
    const err = body.error?.json;
    throw new SpliitError(err?.message ?? `HTTP ${response.status}`, response.status, err?.data?.code);
  }
  return body.result?.data?.json as T;
}

const endpoint = (origin: string, path: string) => `${origin}/api/trpc/${path}`;

export async function query<T>(origin: string, path: string, input?: unknown): Promise<T> {
  const url = new URL(endpoint(origin, path));
  if (input !== undefined) url.searchParams.set('input', JSON.stringify({ json: input }));
  return unwrap<T>(await fetch(url, { headers: { accept: 'application/json' } }));
}

export async function mutate<T>(origin: string, path: string, input: unknown, meta?: unknown): Promise<T> {
  const response = await fetch(endpoint(origin, path), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(meta ? { json: input, meta } : { json: input }),
  });
  return unwrap<T>(response);
}

export async function getGroup(origin: string, groupId: string): Promise<SpliitGroup> {
  const { group } = await query<{ group: SpliitGroup | null }>(origin, 'groups.get', { groupId });
  if (!group) throw new SpliitError('That Spliit group doesn’t exist (or was deleted)', 404, 'NOT_FOUND');
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    currencyCode: group.currencyCode,
    participants: group.participants.map(({ id, name }) => ({ id, name })),
  };
}

export async function listCategories(origin: string): Promise<Category[]> {
  const { categories } = await query<{ categories: Category[] }>(origin, 'categories.list');
  return categories;
}

// Search matches titles and notes.
export async function searchExpenses(origin: string, groupId: string, filter: string): Promise<ExpenseSummary[]> {
  const { expenses } = await query<{ expenses: ExpenseSummary[] }>(origin, 'groups.expenses.list', {
    groupId,
    filter,
    limit: 20,
  });
  return expenses;
}

export async function getExpense(origin: string, groupId: string, expenseId: string): Promise<Expense> {
  const { expense } = await query<{ expense: Expense }>(origin, 'groups.expenses.get', { groupId, expenseId });
  return expense;
}

// `participantId` is who the group's activity log says did it.
export async function createExpense(
  origin: string,
  groupId: string,
  expense: NewExpense,
  participantId?: string,
): Promise<string> {
  const expenseFormValues = {
    ...expense,
    expenseDate: `${expense.expenseDate}T00:00:00.000Z`,
    saveDefaultSplittingOptions: false,
    isReimbursement: false,
    documents: [],
    recurrenceRule: 'NONE',
  };
  const { expenseId } = await mutate<{ expenseId: string }>(
    origin,
    'groups.expenses.create',
    { groupId, expenseFormValues, participantId },
    // superjson's tag for the Date, as the Spliit client sends it.
    { values: { 'expenseFormValues.expenseDate': ['Date'] } },
  );
  return expenseId;
}

export const groupUrl = (origin: string, groupId: string) => `${origin}/groups/${encodeURIComponent(groupId)}`;
export const expenseUrl = (origin: string, groupId: string, expenseId: string) =>
  `${groupUrl(origin, groupId)}/expenses/${encodeURIComponent(expenseId)}/edit`;

// "https://spliit.app/groups/abc123/expenses?ref=share" -> { origin, groupId }
export function parseGroupLink(text: string): { origin: string; groupId: string } | undefined {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const m = /^\/groups\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  return m && m[1] !== 'create' ? { origin: url.origin, groupId: m[1]! } : undefined;
}
