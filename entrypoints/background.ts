import { browser, defineBackground } from '#imports';
import type { Created, FindResult, Request, Result } from '@/lib/messages';
import type { MxTransaction } from '@/lib/mx/match';
import type { NewExpense } from '@/lib/spliit/client';
import { SpliitError, createExpense, expenseUrl, getGroup, listCategories } from '@/lib/spliit/client';
import { findInGroup } from '@/lib/spliit/find';
import type { GroupRef } from '@/lib/store';
import { DEFAULT_ORIGIN, originPattern } from '@/lib/store';

// Makes the Spliit requests for the Money Manager content script and the
// settings page. Lookups are cached briefly: the drawer asks each time it
// opens.

const FIND_TTL_MS = 60_000;
const findCache = new Map<string, { at: number; result: FindResult }>();

class NeedsPermission extends Error {
  constructor(public origin: string) {
    super(`Allow the extension to reach ${origin} in its settings`);
  }
}

async function ensureAccess(origin: string) {
  if (origin === DEFAULT_ORIGIN) return;
  if (!(await browser.permissions.contains({ origins: [originPattern(origin)] }))) throw new NeedsPermission(origin);
}

async function find(groups: GroupRef[], tx: MxTransaction, fresh?: boolean): Promise<FindResult> {
  const key = `${tx.guid} ${groups.map((g) => `${g.origin}/${g.id}`).join(',')}`;
  const cached = findCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < FIND_TTL_MS) return cached.result;
  const result: FindResult = { hits: [], errors: [] };
  await Promise.all(
    groups.map(async (group) => {
      try {
        await ensureAccess(group.origin);
        result.hits.push(...(await findInGroup(group, tx)));
      } catch (err) {
        result.errors.push({ groupName: group.name, error: (err as Error).message });
      }
    }),
  );
  findCache.set(key, { at: Date.now(), result });
  return result;
}

async function create(group: GroupRef, expense: NewExpense, tx: MxTransaction): Promise<Created> {
  await ensureAccess(group.origin);
  const expenseId = await createExpense(group.origin, group.id, expense, group.me);
  findCache.clear();
  // Read it back the way the drawer will, so a Spliit that can't search
  // notes is noticed now rather than as a missed duplicate later.
  const findable = await findInGroup(group, tx).then(
    (hits) => hits.some((h) => h.exact && h.expenseId === expenseId),
    () => false,
  );
  return { expenseId, url: expenseUrl(group.origin, group.id, expenseId), findable };
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'spliit:group':
      await ensureAccess(request.origin);
      return getGroup(request.origin, request.groupId);
    case 'spliit:categories':
      await ensureAccess(request.origin);
      return listCategories(request.origin);
    case 'spliit:find':
      return find(request.groups, request.tx, request.fresh);
    case 'spliit:create':
      return create(request.group, request.expense, request.tx);
    case 'options:open': {
      const url = new URL(browser.runtime.getURL('/options.html'));
      if (request.addLink) url.searchParams.set('add', request.addLink);
      await browser.tabs.create({ url: url.href });
      return null;
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Request, sender, reply) => {
    // Only Money Manager's content script and our own pages may ask.
    const fromMx = sender.url?.startsWith('https://widgets.moneydesktop.com/');
    const fromExtension = sender.url?.startsWith(browser.runtime.getURL('/'));
    if (sender.id !== browser.runtime.id || !(fromMx || fromExtension)) return false;
    handle(message).then(
      (value) => reply({ ok: true, value } satisfies Result<unknown>),
      (err: Error) =>
        reply({
          ok: false,
          error: err instanceof SpliitError || err instanceof NeedsPermission ? err.message : `Couldn't reach Spliit: ${err.message}`,
          needsPermission: err instanceof NeedsPermission ? err.origin : undefined,
        } satisfies Result<unknown>),
    );
    return true; // reply asynchronously
  });
});
