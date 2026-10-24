import { browser } from 'wxt/browser';
import { ask } from '@/lib/messages';
import type { RuleMatch, RuleMode, SplitRule } from '@/lib/rules';
import { matchValue, parseMatchValue, ruleLabel, sameMatch, upsertRule } from '@/lib/rules';
import type { Category, SpliitGroup } from '@/lib/spliit/client';
import { groupUrl, parseGroupLink } from '@/lib/spliit/client';
import type { GroupRef, Settings } from '@/lib/store';
import { DEFAULT_ORIGIN, loadSettings, originPattern, saveSettings } from '@/lib/store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLUListElement>('groups');
const form = $<HTMLFormElement>('add');
const link = $<HTMLInputElement>('link');
const status = $<HTMLDivElement>('status');
const memo = $<HTMLInputElement>('memo');

let settings: Settings;
const details = new Map<string, SpliitGroup | string>(); // group key -> group, or why it couldn't load
const categories = new Map<string, Category[]>(); // origin -> Spliit's categories

// The split rule being added or edited, at most one at a time.
interface Draft {
  group: GroupRef;
  original?: RuleMatch;
  match: string; // matchValue()
  mode: RuleMode;
  included: Set<string>;
  shares: Map<string, string>;
  error?: string;
}
let draft: Draft | undefined;

function say(text: string, tone: '' | 'ok' | 'error' = '') {
  status.textContent = text;
  status.className = tone;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-')) node.setAttribute(k, String(v));
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  node.append(...children);
  return node;
}

function render() {
  list.replaceChildren();
  if (!settings.groups.length) list.append(el('li', { className: 'empty', textContent: 'No groups yet.' }));
  for (const group of settings.groups) {
    const key = `${group.origin} ${group.id}`;
    const info = details.get(key);
    const me = el('select', { 'aria-label': `You in ${group.name}` });
    me.append(el('option', { value: '', textContent: 'You are…' }));
    if (typeof info === 'object') {
      for (const p of info.participants) me.append(el('option', { value: p.id, textContent: p.name, selected: p.id === group.me }));
    }
    me.disabled = typeof info !== 'object';
    me.addEventListener('change', async () => {
      group.me = me.value || undefined;
      await saveSettings({ groups: settings.groups });
      say(`Saved: you are ${me.selectedOptions[0]?.textContent} in ${group.name}`, 'ok');
    });
    const remove = el('button', { type: 'button', textContent: 'Remove' });
    remove.addEventListener('click', async () => {
      settings.groups = settings.groups.filter((g) => g !== group);
      await saveSettings({ groups: settings.groups });
      say(`Removed ${group.name}. Its expenses stay in Spliit.`, 'ok');
      render();
    });
    const name = el('a', { className: 'name', href: groupUrl(group.origin, group.id), target: '_blank', textContent: group.name });
    const origin = el('div', { className: 'origin', textContent: typeof info === 'string' ? `${group.origin} — ${info}` : group.origin });
    list.append(el('li', {}, el('div', {}, name, origin), me, remove, renderRules(group, info)));
  }
}

const shareText = (rule: SplitRule, info: SpliitGroup | string | undefined) => {
  const names = new Map(typeof info === 'object' ? info.participants.map((p) => [p.id, p.name]) : []);
  const people = Object.entries(rule.shares).map(([id, n]) => (rule.mode === 'BY_SHARES' ? `${names.get(id) ?? '?'} ${n}` : (names.get(id) ?? '?')));
  return `${rule.mode === 'BY_SHARES' ? 'by shares' : 'evenly'}: ${people.join(' · ')}`;
};

function renderRules(group: GroupRef, info: SpliitGroup | string | undefined): HTMLElement {
  const cats = categories.get(group.origin) ?? [];
  const box = el('div', { className: 'rules' });
  const add = el('button', { type: 'button', className: 'link', textContent: 'Add rule' });
  add.disabled = typeof info !== 'object' || !cats.length || draft?.group === group;
  add.addEventListener('click', () => {
    startDraft(group, info as SpliitGroup);
    render();
  });
  box.append(el('div', { className: 'rules-head' }, el('b', { textContent: 'Split rules by category' }), add));
  const rules = group.rules ?? [];
  if (!rules.length && draft?.group !== group) {
    box.append(el('div', { className: 'hint', textContent: 'None: the dialog starts from the last split you used in this group.' }));
  }
  for (const rule of rules) {
    const editButton = el('button', { type: 'button', className: 'link', textContent: 'Edit' });
    editButton.disabled = typeof info !== 'object';
    editButton.addEventListener('click', () => {
      startDraft(group, info as SpliitGroup, rule);
      render();
    });
    const removeButton = el('button', { type: 'button', className: 'link', textContent: 'Remove' });
    removeButton.addEventListener('click', async () => {
      group.rules = rules.filter((r) => r !== rule);
      await saveSettings({ groups: settings.groups });
      say(`Removed the rule for ${ruleLabel(rule.match, cats)}.`, 'ok');
      render();
    });
    box.append(
      el('div', { className: 'rule' }, el('span', {}, el('b', { textContent: ruleLabel(rule.match, cats) }), ` — ${shareText(rule, info)}`), editButton, removeButton),
    );
  }
  if (draft?.group === group && typeof info === 'object') box.append(renderDraft(draft, info, cats));
  return box;
}

function startDraft(group: GroupRef, info: SpliitGroup, rule?: SplitRule) {
  const cats = categories.get(group.origin) ?? [];
  draft = {
    group,
    original: rule?.match,
    match: rule ? matchValue(rule.match) : `g:${cats[0]?.grouping ?? ''}`,
    mode: rule?.mode ?? 'BY_SHARES',
    included: new Set(rule ? Object.keys(rule.shares) : info.participants.map((p) => p.id)),
    shares: new Map(Object.entries(rule?.shares ?? {}).map(([id, n]) => [id, String(n)])),
  };
}

function renderDraft(d: Draft, info: SpliitGroup, cats: Category[]): HTMLElement {
  const match = el('select', { 'aria-label': 'Category' });
  for (const grouping of new Set(cats.map((c) => c.grouping))) {
    const optgroup = el('optgroup', { label: grouping });
    optgroup.append(el('option', { value: `g:${grouping}`, textContent: `All ${grouping}` }));
    for (const c of cats.filter((c) => c.grouping === grouping)) optgroup.append(el('option', { value: `c:${c.id}`, textContent: c.name }));
    match.append(optgroup);
  }
  match.value = d.match;
  match.addEventListener('change', () => (d.match = match.value));

  const mode = el('select', { 'aria-label': 'Split' });
  mode.append(el('option', { value: 'EVENLY', textContent: 'Evenly' }), el('option', { value: 'BY_SHARES', textContent: 'By shares' }));
  mode.value = d.mode;
  mode.addEventListener('change', () => {
    d.mode = mode.value as RuleMode;
    render();
  });

  const table = el('table');
  for (const p of info.participants) {
    const check = el('input', { type: 'checkbox', checked: d.included.has(p.id), 'aria-label': `Include ${p.name}` });
    check.addEventListener('change', () => {
      if (check.checked) d.included.add(p.id);
      else d.included.delete(p.id);
      render();
    });
    const shares = el('input', { type: 'text', inputMode: 'decimal', value: d.shares.get(p.id) ?? '1', 'aria-label': `${p.name}'s shares` });
    shares.disabled = !d.included.has(p.id);
    shares.addEventListener('input', () => d.shares.set(p.id, shares.value));
    const row = el('tr', {}, el('td', {}, check), el('td', { textContent: p.name }));
    if (d.mode === 'BY_SHARES') row.append(el('td', {}, shares));
    table.append(row);
  }

  const save = el('button', { type: 'button', className: 'primary', textContent: 'Save rule' });
  save.addEventListener('click', async () => {
    const parsed = parseMatchValue(d.match);
    const shares: Record<string, number> = {};
    for (const p of info.participants) {
      if (!d.included.has(p.id)) continue;
      const n = d.mode === 'BY_SHARES' ? Number((d.shares.get(p.id) ?? '1').replace(',', '.')) : 1;
      if (!(n > 0)) {
        d.error = `${p.name}'s shares must be a number above zero`;
        return render();
      }
      shares[p.id] = n;
    }
    if (!parsed) d.error = 'Pick a category';
    else if (!Object.keys(shares).length) d.error = 'Include at least one person';
    if (d.error || !parsed) return render();
    const kept = (d.group.rules ?? []).filter((r) => !d.original || !sameMatch(r.match, d.original));
    d.group.rules = upsertRule(kept, { match: parsed, mode: d.mode, shares });
    await saveSettings({ groups: settings.groups });
    say(`Saved: ${ruleLabel(parsed, cats)} in ${d.group.name} is split ${d.mode === 'BY_SHARES' ? 'by shares' : 'evenly'}.`, 'ok');
    draft = undefined;
    render();
  });
  const cancel = el('button', { type: 'button', textContent: 'Cancel' });
  cancel.addEventListener('click', () => {
    draft = undefined;
    render();
  });

  return el(
    'div',
    { className: 'draft' },
    el('div', { className: 'row' }, match, mode),
    table,
    el('div', { className: 'hint', textContent: 'A rule for one category wins over a rule for its whole group. Saving a rule for a category that already has one replaces it.' }),
    d.error ? el('div', { className: 'hint error', textContent: d.error }) : '',
    el('div', { className: 'row' }, save, cancel),
  );
}

async function loadDetails() {
  await Promise.all([
    ...settings.groups.map(async (group) => {
      const result = await ask({ type: 'spliit:group', origin: group.origin, groupId: group.id });
      details.set(`${group.origin} ${group.id}`, result.ok ? result.value : result.error);
      if (result.ok && result.value.name !== group.name) group.name = result.value.name;
    }),
    ...[...new Set(settings.groups.map((g) => g.origin))].map(async (origin) => {
      const result = await ask({ type: 'spliit:categories', origin });
      if (result.ok) categories.set(origin, result.value);
    }),
  ]);
  await saveSettings({ groups: settings.groups });
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const parsed = parseGroupLink(link.value);
  if (!parsed) return say('That doesn’t look like a Spliit group link (…/groups/…).', 'error');
  // Ask first, while this still counts as the click that allows it.
  if (parsed.origin !== DEFAULT_ORIGIN) {
    const granted = await browser.permissions.request({ origins: [originPattern(parsed.origin)] });
    if (!granted) return say(`The extension needs access to ${parsed.origin} to use that group.`, 'error');
  }
  if (settings.groups.some((g) => g.origin === parsed.origin && g.id === parsed.groupId)) return say('That group is already added.');
  say('Checking the group…');
  const result = await ask({ type: 'spliit:group', origin: parsed.origin, groupId: parsed.groupId });
  if (!result.ok) return say(result.error, 'error');
  settings.groups.push({ origin: parsed.origin, id: parsed.groupId, name: result.value.name });
  details.set(`${parsed.origin} ${parsed.groupId}`, result.value);
  if (!categories.has(parsed.origin)) {
    const cats = await ask({ type: 'spliit:categories', origin: parsed.origin });
    if (cats.ok) categories.set(parsed.origin, cats.value);
  }
  await saveSettings({ groups: settings.groups });
  link.value = '';
  say(`Added ${result.value.name}. Pick who you are in it.`, 'ok');
  render();
});

memo.addEventListener('change', () => void saveSettings({ writeMemo: memo.checked }));

(async () => {
  settings = await loadSettings();
  memo.checked = settings.writeMemo;
  const add = new URLSearchParams(location.search).get('add');
  if (add) {
    link.value = add;
    say('Click Add group to finish adding this group.');
  }
  render();
  await loadDetails();
})();
