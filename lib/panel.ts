// The "Add to Spliit" dialog, opened from the Transaction Details drawer.
// Runs in Money Manager's ISOLATED world: MX lookups and the memo edit go to
// the MAIN world over the bridge, Spliit requests go to the background worker.
import type { Status } from './bridge';
import { callMain, connectBridge } from './bridge';
import type { ButtonState } from './drawer';
import { setButton, watchDrawer } from './drawer';
import type { FindResult, Hit } from './messages';
import { ask } from './messages';
import type { DrawerTarget, MxTransaction } from './mx/match';
import { STYLE } from './panel-style';
import { findRule, ruleLabel } from './rules';
import { guessCategory } from './spliit/categories';
import type { Category, SpliitGroup } from './spliit/client';
import { parseGroupLink } from './spliit/client';
import { buildNotes, memoWithSpliit, spliitMemo, today } from './spliit/notes';
import type { SplitMode } from './spliit/split';
import { apportion, computeSplit } from './spliit/split';
import type { GroupRef, Settings } from './store';
import { DEFAULT_ORIGIN, groupKey, loadSettings, saveSettings } from './store';

type Load<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: string; needsPermission?: string };

interface Lookup {
  find: FindResult;
  exact: Hit[];
  possible: Hit[];
}

interface Form {
  title: string;
  amount: string; // dollars, negative for a refund
  date: string;
  category: number;
  paidBy: string;
  mode: SplitMode;
  included: Set<string>;
  values: Map<string, string>; // participant -> shares or dollars
  notes: string;
  writeMemo: boolean;
  rule?: string; // label of the group's split rule in use, until the split is edited
}

interface Done {
  url: string;
  groupName: string;
  memo: 'written' | 'skipped' | { error: string };
  findable: boolean;
}

const state = {
  open: false,
  target: undefined as DrawerTarget | undefined,
  button: undefined as HTMLButtonElement | undefined,
  candidates: undefined as MxTransaction[] | undefined,
  tx: undefined as MxTransaction | undefined,
  settings: undefined as Settings | undefined,
  group: undefined as GroupRef | undefined,
  groups: new Map<string, Load<SpliitGroup>>(),
  categories: new Map<string, Load<Category[]>>(),
  lookup: undefined as Load<Lookup> | undefined,
  addAnyway: false,
  form: undefined as Form | undefined,
  saving: false,
  error: undefined as string | undefined,
  done: undefined as Done | undefined,
  adding: false, // showing the "add a group" form
  addError: undefined as string | undefined,
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('data-') || k.startsWith('aria-')) el.setAttribute(k, String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const money = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return text.trim() === '' || Number.isNaN(n) ? undefined : Math.round(n * 100);
};
const signedCents = (tx: MxTransaction) => (tx.credit ? -tx.cents : tx.cents);
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// ---- Looking transactions up in Spliit (shared with the drawer button)

async function lookup(tx: MxTransaction, groups: GroupRef[], fresh?: boolean): Promise<Lookup> {
  const result = await ask({ type: 'spliit:find', groups, tx, fresh });
  if (!result.ok) throw new Error(result.error);
  const exact = result.value.hits.filter((hit) => hit.exact);
  const others = result.value.hits.filter((hit) => !hit.exact);
  // A look-alike is only suspicious if the transaction it was added from is
  // gone from Money Manager, as when a pending charge posts under a new guid.
  const guids = [...new Set(others.flatMap((hit) => hit.mxGuids))];
  const loaded = new Set(guids.length ? await callMain<string[]>({ op: 'loaded', guids }) : []);
  const possible = others.filter((hit) => !hit.mxGuids.some((g) => loaded.has(g)));
  return { find: result.value, exact, possible };
}

function buttonState(found: Lookup): ButtonState {
  if (found.exact.length) {
    return {
      label: '✓ In Spliit',
      done: true,
      title: found.exact.map((hit) => `${hit.groupName}${hit.addedOn ? `, added ${hit.addedOn}` : ''}`).join('\n'),
    };
  }
  if (found.possible.length) return { label: 'Add to Spliit (maybe added)', title: 'A Spliit expense looks like this charge' };
  return { label: 'Add to Spliit' };
}

let showSeq = 0;
async function onDrawerShow(target: DrawerTarget, button: HTMLButtonElement, recheck: boolean) {
  // Rechecks are for drawers that matched nothing before more data loaded.
  if (recheck && button.dataset.matched && button.dataset.matched !== '0') return;
  const token = String(++showSeq);
  button.dataset.token = token;
  const stale = () => button.dataset.token !== token;
  setButton(button, { label: 'Add to Spliit' });
  const [settings, candidates] = await Promise.all([
    loadSettings(),
    callMain<MxTransaction[]>({ op: 'match', target }).catch(() => [] as MxTransaction[]),
  ]);
  if (stale()) return;
  button.dataset.matched = String(candidates.length);
  // Ambiguous or not loaded yet: the dialog sorts it out.
  if (stale() || candidates.length !== 1 || !settings.groups.length) return;
  setButton(button, { label: 'Checking Spliit…', busy: true });
  try {
    const found = await lookup(candidates[0]!, settings.groups);
    if (!stale()) setButton(button, buttonState(found));
  } catch (err) {
    if (!stale()) setButton(button, { label: 'Add to Spliit', title: `Couldn't check Spliit: ${(err as Error).message}` });
  }
}

// ---- Dialog state

async function openDialog(target: DrawerTarget, button: HTMLButtonElement) {
  Object.assign(state, {
    open: true,
    target,
    button,
    candidates: undefined,
    tx: undefined,
    lookup: undefined,
    addAnyway: false,
    form: undefined,
    saving: false,
    error: undefined,
    done: undefined,
    adding: false,
    addError: undefined,
  });
  render();
  const [settings, candidates] = await Promise.all([
    loadSettings(),
    callMain<MxTransaction[]>({ op: 'match', target }).catch(() => [] as MxTransaction[]),
  ]);
  state.settings = settings;
  state.candidates = candidates;
  state.group = settings.groups.find((g) => groupKey(g) === settings.lastGroup) ?? settings.groups[0];
  state.adding = !settings.groups.length;
  if (candidates.length === 1) selectTransaction(candidates[0]!);
  if (state.group) void selectGroup(state.group);
  render();
}

function selectTransaction(tx: MxTransaction) {
  state.tx = tx;
  state.form = undefined;
  if (state.group) initForm();
  runLookup();
}

function runLookup(fresh?: boolean) {
  const { tx, settings } = state;
  if (!tx || !settings?.groups.length) return;
  state.lookup = { status: 'loading' };
  lookup(tx, settings.groups, fresh).then(
    (value) => {
      if (state.tx !== tx) return;
      state.lookup = { status: 'ready', value };
      if (state.button) setButton(state.button, buttonState(value));
      render();
    },
    (err: Error) => {
      if (state.tx !== tx) return;
      state.lookup = { status: 'error', error: err.message };
      render();
    },
  );
}

async function selectGroup(group: GroupRef) {
  state.group = group;
  const key = groupKey(group);
  const loads: Promise<void>[] = [];
  if (state.groups.get(key)?.status !== 'ready') {
    state.groups.set(key, { status: 'loading' });
    loads.push(
      ask({ type: 'spliit:group', origin: group.origin, groupId: group.id }).then((r) => {
        state.groups.set(key, r.ok ? { status: 'ready', value: r.value } : { status: 'error', ...r });
        // Keep the stored name in step with Spliit.
        if (r.ok && r.value.name !== group.name && state.settings) {
          group.name = r.value.name;
          void saveSettings({ groups: state.settings.groups });
        }
      }),
    );
  }
  if (state.categories.get(group.origin)?.status !== 'ready') {
    state.categories.set(group.origin, { status: 'loading' });
    loads.push(
      ask({ type: 'spliit:categories', origin: group.origin }).then((r) => {
        state.categories.set(group.origin, r.ok ? { status: 'ready', value: r.value } : { status: 'error', ...r });
      }),
    );
  }
  render();
  await Promise.all(loads);
  if (state.group === group) initForm();
  render();
}

function groupInfo(): SpliitGroup | undefined {
  const load = state.group && state.groups.get(groupKey(state.group));
  return load?.status === 'ready' ? load.value : undefined;
}

function categoryList(): Category[] {
  const load = state.group && state.categories.get(state.group.origin);
  return load?.status === 'ready' ? load.value : [];
}

// Fills the form for the selected transaction and group, keeping what was
// already typed when only the group changes.
function initForm() {
  const { tx, target, group, settings } = state;
  const info = groupInfo();
  if (!tx || !target || !group || !settings || !info) return;
  const ids = info.participants.map((p) => p.id);
  const prev = state.form;
  const mxCategory = target.category.toLowerCase();
  state.form = {
    title: prev?.title ?? (tx.payee || target.payee || tx.feed),
    amount: prev?.amount ?? dollars(signedCents(tx)),
    date: prev?.date ?? target.date,
    category: prev?.category ?? settings.categories[mxCategory] ?? guessCategory(target.category, categoryList()) ?? 0,
    paidBy: group.me && ids.includes(group.me) ? group.me : '',
    mode: 'EVENLY',
    included: new Set(),
    values: new Map(),
    notes: prev?.notes ?? '',
    writeMemo: settings.writeMemo,
  };
  applySplit();
}

// The group's rule for the chosen category, or else the split used last time.
function applySplit() {
  const { form, group, settings } = state;
  const info = groupInfo();
  if (!form || !group || !settings || !info) return;
  const ids = info.participants.map((p) => p.id);
  const rule = findRule(group.rules, form.category, categoryList());
  const ruleIds = rule ? Object.keys(rule.shares).filter((id) => ids.includes(id)) : [];
  if (rule && ruleIds.length) {
    form.mode = rule.mode;
    form.included = new Set(ruleIds);
    form.values = new Map(ruleIds.map((id) => [id, String(rule.shares[id])]));
    form.rule = ruleLabel(rule.match, categoryList());
    return;
  }
  const last = settings.lastSplit[groupKey(group)];
  form.included = new Set((last?.participants ?? ids).filter((id) => ids.includes(id)));
  if (!form.included.size) ids.forEach((id) => form.included.add(id));
  form.mode = last?.mode ?? 'EVENLY';
  form.rule = undefined;
  fillValues();
}

// Default per-person values for the current mode: one share each, or the
// amount shared evenly.
function fillValues() {
  const form = state.form;
  if (!form) return;
  const ids = [...form.included];
  const even = apportion(toCents(form.amount) ?? 0, ids.map(() => 1));
  form.values = new Map(ids.map((id, i) => [id, form.mode === 'BY_AMOUNT' ? dollars(even[i]!) : '1']));
}

function split() {
  const form = state.form!;
  const values = new Map([...form.included].map((id) => [id, form.values.get(id) ?? '']));
  return computeSplit({ mode: form.mode, amountCents: toCents(form.amount) ?? 0, values });
}

async function addGroup(link: string) {
  const parsed = parseGroupLink(link);
  if (!parsed) {
    state.addError = 'Paste the link to a Spliit group (…/groups/…)';
    return render();
  }
  if (parsed.origin !== DEFAULT_ORIGIN) {
    // Only an extension page can ask for access to another server.
    void ask({ type: 'options:open', addLink: link });
    state.addError = `Finish adding the ${parsed.origin} group in the settings tab that just opened, then reopen this.`;
    return render();
  }
  state.addError = undefined;
  const result = await ask({ type: 'spliit:group', origin: parsed.origin, groupId: parsed.groupId });
  if (!result.ok) {
    state.addError = result.error;
    return render();
  }
  const settings = state.settings!;
  let group = settings.groups.find((g) => g.origin === parsed.origin && g.id === parsed.groupId);
  if (!group) {
    group = { origin: parsed.origin, id: parsed.groupId, name: result.value.name };
    settings.groups.push(group);
    await saveSettings({ groups: settings.groups });
  }
  state.groups.set(groupKey(group), { status: 'ready', value: result.value });
  state.adding = false;
  runLookup(true);
  await selectGroup(group);
}

async function submit() {
  const { tx, group, settings, form, target } = state;
  const info = groupInfo();
  if (!tx || !group || !settings || !form || !info || !target) return;
  const amount = toCents(form.amount);
  const result = split();
  state.error =
    form.title.trim().length < 2
      ? 'Give it a title (2 characters or more)'
      : !amount
        ? 'Enter an amount'
        : !form.paidBy
          ? 'Choose who paid'
          : !/^\d{4}-\d{2}-\d{2}$/.test(form.date)
            ? 'Pick a date'
            : !result.ok
              ? result.error
              : undefined;
  if (state.error || !result.ok || !amount) return render();

  state.saving = true;
  render();
  const addedOn = today();
  const created = await ask({
    type: 'spliit:create',
    group: { ...group, me: form.paidBy },
    tx,
    expense: {
      expenseDate: form.date,
      title: form.title.trim(),
      category: form.category,
      amount,
      paidBy: form.paidBy,
      paidFor: result.paidFor,
      splitMode: form.mode,
      notes: buildNotes(form.notes, tx, addedOn),
    },
  });
  if (!created.ok) {
    state.saving = false;
    state.error = created.error;
    return render();
  }

  // Remember choices for next time.
  group.me = form.paidBy;
  settings.lastGroup = groupKey(group);
  settings.writeMemo = form.writeMemo;
  // A rule's split isn't "the last one used" for categories without a rule.
  if (!form.rule) settings.lastSplit[groupKey(group)] = { mode: form.mode, participants: [...form.included] };
  if (target.category) settings.categories[target.category.toLowerCase()] = form.category;
  void saveSettings(settings);

  let memo: Done['memo'] = 'skipped';
  if (form.writeMemo) {
    const note = spliitMemo(addedOn, info.name, created.value.url);
    memo = await callMain({ op: 'setMemo', guid: tx.guid, memo: memoWithSpliit(tx.memo, note, created.value.url) }).then(
      () => 'written' as const,
      (err: Error) => ({ error: err.message }),
    );
  }
  state.saving = false;
  state.done = { url: created.value.url, groupName: info.name, memo, findable: created.value.findable };
  render();
  runLookup(true);
}

// ---- Rendering

let shadow: ShadowRoot;
let panel: HTMLElement;

function hitLine(hit: Hit) {
  return h(
    'div',
    {},
    `${hit.title} · ${money(hit.amount)} · ${shortDate(hit.expenseDate)} in ${hit.groupName}`,
    hit.addedOn ? ` (added ${hit.addedOn})` : '',
    ' — ',
    h('a', { href: hit.url, target: '_blank', rel: 'noopener', textContent: 'Open in Spliit ↗' }),
  );
}

function renderTransaction(): Node[] {
  const { target, candidates, tx } = state;
  if (!target) return [];
  if (!candidates) return [h('div', { className: 'muted', textContent: 'Finding the transaction…' })];
  if (!candidates.length) {
    return [
      h('p', {
        className: 'callout warn',
        textContent:
          "Couldn't find this transaction among those Money Manager has loaded. Close the drawer, scroll the list to it and try again, or reload Money Manager.",
      }),
    ];
  }
  const out: Node[] = [];
  if (candidates.length > 1) {
    const select = h(
      'select',
      { 'aria-label': 'Which transaction' },
      h('option', { value: '', textContent: `${candidates.length} transactions look like this one; pick one…` }),
      ...candidates.map((c) =>
        h('option', {
          value: c.guid,
          selected: c.guid === tx?.guid,
          textContent: [c.payee, c.feed, c.accountName, c.memo].filter(Boolean).join(' · '),
        }),
      ),
    );
    select.addEventListener('change', () => {
      const picked = candidates.find((c) => c.guid === select.value);
      if (picked) selectTransaction(picked);
      render();
    });
    out.push(select);
  }
  const t = tx ?? candidates[0]!;
  out.push(
    h(
      'div',
      { className: 'tx' },
      h('span', { className: 'payee', textContent: t.payee || target.payee }),
      h('span', { className: 'amount', textContent: `${t.credit ? '+' : ''}${money(t.cents)}` }),
      h('span', { className: 'sub', textContent: [shortDate(target.date), t.feed, t.accountName].filter(Boolean).join(' · ') }),
      h('span', { className: 'sub', textContent: [t.pending && 'pending', t.credit && 'refund / credit'].filter(Boolean).join(' · ') }),
    ),
  );
  if (t.pending && !state.done) {
    out.push(
      h('p', {
        className: 'callout warn',
        textContent:
          'This charge is still pending. Its amount can change when it posts (tips, fuel, holds), and Money Manager may replace it with a new transaction that won’t have the memo note.',
      }),
    );
  }
  return out;
}

function renderLookup(): Node[] {
  const load = state.lookup;
  if (!load) return [];
  if (load.status === 'loading') return [h('div', { className: 'muted', textContent: 'Checking Spliit…' })];
  if (load.status === 'error') return [h('p', { className: 'callout danger', textContent: `Couldn't check Spliit: ${load.error}` })];
  const { exact, possible, find } = load.value;
  const out: Node[] = [];
  if (exact.length) out.push(h('div', { className: 'callout ok' }, h('b', { textContent: 'Already in Spliit' }), ...exact.map(hitLine)));
  if (possible.length) {
    out.push(
      h(
        'div',
        { className: 'callout warn' },
        h('b', { textContent: 'Possibly already in Spliit' }),
        h('span', { textContent: 'Same account and amount, added from a transaction Money Manager no longer shows (a pending charge that has since posted?):' }),
        ...possible.map(hitLine),
      ),
    );
  }
  for (const { groupName, error } of find.errors) {
    out.push(h('p', { className: 'callout danger', textContent: `Couldn't check ${groupName}: ${error}` }));
  }
  return out;
}

function renderAddGroup(): Node {
  const input = h('input', { type: 'url', placeholder: 'https://spliit.app/groups/…', 'aria-label': 'Spliit group link' });
  const go = h('button', { className: 'btn primary', type: 'submit', textContent: 'Add group' });
  const form = h(
    'form',
    { className: 'grid' },
    h('label', { textContent: 'Group link' }),
    input,
    h('span'),
    h(
      'div',
      { className: 'actions' },
      h('span', {
        className: `note${state.addError ? ' error' : ''}`,
        textContent: state.addError ?? 'Copy it from the group in Spliit (Share, or the address bar).',
      }),
      state.settings?.groups.length
        ? h('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: () => ((state.adding = false), render()) })
        : null,
      go,
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go.disabled = true;
    void addGroup(input.value);
  });
  queueMicrotask(() => input.focus());
  return form;
}

function renderForm(): Node[] {
  const { settings, group, form } = state;
  if (!settings || !group) return [];
  const groupLoad = state.groups.get(groupKey(group));
  const info = groupInfo();

  const groupSelect = h(
    'select',
    { 'aria-label': 'Spliit group' },
    ...settings.groups.map((g) => h('option', { value: groupKey(g), textContent: g.name, selected: g === group })),
    h('option', { value: '+', textContent: 'Add another group…' }),
  );
  groupSelect.addEventListener('change', () => {
    if (groupSelect.value === '+') {
      state.adding = true;
      return render();
    }
    const picked = settings.groups.find((g) => groupKey(g) === groupSelect.value);
    if (picked) void selectGroup(picked);
  });
  const out: Node[] = [h('div', { className: 'grid' }, h('label', { textContent: 'Group' }), groupSelect)];

  if (!groupLoad || groupLoad.status === 'loading') return [...out, h('div', { className: 'muted', textContent: 'Loading group…' })];
  if (groupLoad.status === 'error') {
    out.push(h('p', { className: 'callout danger', textContent: `Couldn't load ${group.name}: ${groupLoad.error}` }));
    if (groupLoad.needsPermission) {
      out.push(h('button', { className: 'btn', textContent: 'Open settings', onclick: () => void ask({ type: 'options:open' }) }));
    }
    return out;
  }
  if (!info || !form) return out;
  if (info.currencyCode && info.currencyCode !== 'USD') {
    out.push(h('p', { className: 'callout warn', textContent: `${info.name} uses ${info.currencyCode}; the amount is added as is, without converting from USD.` }));
  }

  const titleInput = h('input', { type: 'text', 'aria-label': 'Title', maxLength: 200 });
  const bind = <E extends HTMLInputElement | HTMLTextAreaElement>(el: E, key: 'title' | 'amount' | 'date' | 'notes', after?: () => void) => {
    el.value = form[key];
    el.addEventListener('input', () => {
      form[key] = el.value;
      state.error = undefined;
      after?.();
    });
    return el;
  };

  const categories = categoryList();
  const groupings = [...new Set(categories.map((c) => c.grouping))];
  const category = h(
    'select',
    { 'aria-label': 'Category' },
    ...(categories.length
      ? groupings.map((g) =>
          h(
            'optgroup',
            { label: g },
            ...categories.filter((c) => c.grouping === g).map((c) => h('option', { value: String(c.id), textContent: c.name, selected: c.id === form.category })),
          ),
        )
      : [h('option', { value: '0', textContent: 'General' })]),
  );
  category.value = String(form.category);
  category.addEventListener('change', () => {
    const fromRule = !!form.rule;
    form.category = Number(category.value);
    // Follow the rules, but keep a split that was set by hand.
    if (fromRule || findRule(state.group?.rules, form.category, categories)) {
      applySplit();
      render();
    }
  });

  const paidBy = h(
    'select',
    { 'aria-label': 'Paid by' },
    h('option', { value: '', textContent: 'Who paid? (you)', disabled: true, selected: !form.paidBy }),
    ...info.participants.map((p) => h('option', { value: p.id, textContent: p.name, selected: p.id === form.paidBy })),
  );
  paidBy.addEventListener('change', () => (form.paidBy = paidBy.value));

  const mode = h(
    'select',
    { 'aria-label': 'Split' },
    ...(
      [
        ['EVENLY', 'Evenly'],
        ['BY_SHARES', 'By shares'],
        ['BY_AMOUNT', 'By amount'],
      ] as const
    ).map(([value, label]) => h('option', { value, textContent: label, selected: value === form.mode })),
  );
  mode.addEventListener('change', () => {
    form.mode = mode.value as SplitMode;
    form.rule = undefined;
    fillValues();
    render();
  });

  const previews = new Map<string, HTMLElement>();
  const rows = info.participants.map((p) => {
    const on = form.included.has(p.id);
    const check = h('input', { type: 'checkbox', checked: on, 'aria-label': `Split with ${p.name}` });
    check.addEventListener('change', () => {
      if (check.checked) form.included.add(p.id);
      else form.included.delete(p.id);
      form.rule = undefined;
      fillValues();
      render();
    });
    const value = h('input', { type: 'text', className: 'num', inputMode: 'decimal', 'aria-label': `${p.name}'s ${form.mode === 'BY_AMOUNT' ? 'amount' : 'shares'}` });
    value.value = form.values.get(p.id) ?? '';
    value.disabled = !on;
    value.addEventListener('input', () => {
      form.values.set(p.id, value.value);
      form.rule = undefined;
      state.error = undefined;
      updatePreview();
    });
    const preview = h('td', { className: 'share' });
    previews.set(p.id, preview);
    return h(
      'tr',
      { className: on ? '' : 'off' },
      h('td', { className: 'check' }, check),
      h('td', { textContent: p.name }),
      form.mode === 'EVENLY' ? null : h('td', { className: 'value' }, value),
      preview,
    );
  });

  const note = h('span', { className: 'note' });
  const ruleNote = h('div', { className: 'muted rule' });
  const updatePreview = () => {
    ruleNote.textContent = form.rule ? `From the ${info.name} rule for “${form.rule}”` : '';
    ruleNote.hidden = !form.rule;
    const result = split();
    for (const [id, cell] of previews) cell.textContent = result.ok && result.cents.has(id) ? money(result.cents.get(id)!) : '';
    const message = state.error ?? (result.ok ? '' : result.error);
    note.textContent = message;
    note.className = `note${state.error ? ' error' : ''}`;
  };

  const amount = bind(h('input', { type: 'text', className: 'num', inputMode: 'decimal', 'aria-label': 'Amount' }), 'amount', updatePreview);
  const memo = h('input', { type: 'checkbox', checked: form.writeMemo });
  memo.addEventListener('change', () => (form.writeMemo = memo.checked));
  const save = h('button', { className: 'btn primary', type: 'button', textContent: state.saving ? 'Adding…' : 'Add to Spliit', disabled: state.saving });
  save.addEventListener('click', () => void submit());

  out.push(
    h(
      'div',
      { className: 'grid' },
      h('label', { textContent: 'Title' }),
      bind(titleInput, 'title', () => updatePreview()),
      h('label', { textContent: 'Amount, date' }),
      h('div', { className: 'pair' }, amount, bind(h('input', { type: 'date', 'aria-label': 'Date' }), 'date')),
      h('label', { textContent: 'Category' }),
      category,
      h('label', { textContent: 'Paid by' }),
      paidBy,
      h('label', { textContent: 'Split' }),
      h('div', {}, mode, ruleNote),
    ),
    h('table', {}, h('tbody', {}, ...rows)),
    h(
      'div',
      { className: 'grid' },
      h('label', { textContent: 'Notes' }),
      bind(h('textarea', { 'aria-label': 'Notes', placeholder: 'Optional; the bank details are added for you' }), 'notes'),
    ),
    h('label', { className: 'option' }, memo, 'Note it in the Money Manager memo, with a link'),
    h('div', { className: 'actions' }, note, save),
  );
  updatePreview();
  return out;
}

function renderDone(done: Done): Node[] {
  return [
    h(
      'div',
      { className: 'callout ok' },
      h('b', { textContent: `Added to ${done.groupName}` }),
      h('a', { href: done.url, target: '_blank', rel: 'noopener', textContent: 'Open in Spliit ↗' }),
    ),
    done.memo === 'written'
      ? h('div', {
          className: 'muted',
          textContent: "Memo updated. Reload Money Manager to see it; editing this transaction's memo before then would overwrite it.",
        })
      : done.memo === 'skipped'
        ? null
        : h('p', { className: 'callout danger', textContent: `Couldn't update the memo: ${done.memo.error}` }),
    done.findable
      ? null
      : h('p', {
          className: 'callout warn',
          textContent: "This Spliit server didn't find the new expense when searching its notes, so already-added transactions won't be recognized there.",
        }),
    h(
      'div',
      { className: 'actions' },
      h('span', { className: 'note' }),
      h('button', {
        className: 'btn',
        textContent: 'Add to another group',
        onclick: () => {
          state.done = undefined;
          state.addAnyway = true;
          render();
        },
      }),
      h('button', { className: 'btn primary', textContent: 'Done', onclick: close }),
    ),
  ].filter((n) => n !== null);
}

function render() {
  if (!panel) return;
  panel.hidden = !state.open;
  if (!state.open) return;
  const settingsButton = h('button', { className: 'icon', title: 'Settings', 'aria-label': 'Settings', textContent: '⚙' });
  settingsButton.addEventListener('click', () => void ask({ type: 'options:open' }));
  const closeButton = h('button', { className: 'icon', title: 'Close', 'aria-label': 'Close', textContent: '×' });
  closeButton.addEventListener('click', close);

  const body: Node[] = [...renderTransaction()];
  if (state.done) body.push(...renderDone(state.done));
  else if (state.tx) {
    body.push(...renderLookup());
    const already = state.lookup?.status === 'ready' && state.lookup.value.exact.length > 0;
    if (state.adding) body.push(renderAddGroup());
    else if (already && !state.addAnyway) {
      body.push(
        h(
          'div',
          { className: 'actions' },
          h('span', { className: 'note' }),
          h('button', { className: 'btn', textContent: 'Add again anyway', onclick: () => ((state.addAnyway = true), render()) }),
        ),
      );
    } else body.push(...renderForm());
  } else if (state.adding && state.settings) body.push(renderAddGroup());

  panel.replaceChildren(
    h('header', {}, h('h2', { textContent: 'Add to Spliit' }), h('span', { className: 'spacer' }), settingsButton, closeButton),
    h('div', { className: 'content' }, ...body),
  );
}

function close() {
  state.open = false;
  render();
}

export function mountPanel() {
  const host = document.createElement('div');
  host.id = 'becu-mx-spliit';
  shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', { textContent: STYLE }));
  panel = h('div', { className: 'panel', role: 'dialog', 'aria-label': 'Add to Spliit', hidden: true });
  shadow.append(panel);
  document.body.append(host);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  const recheck = watchDrawer(onDrawerShow, (target, button) => void openDialog(target, button));
  let count = -1;
  connectBridge((status: Status) => {
    // More transactions loaded: a drawer that matched nothing may now match.
    if (status.transactionCount !== count) {
      count = status.transactionCount;
      recheck(true);
    }
  });
}
