// Adds an "Add to Spliit" button to Money Manager's Transaction Details
// drawer, under the payee and amount. The drawer doesn't expose the
// transaction's guid, so what it shows is read for matching (lib/mx/match.ts).
// (Adapted from becu_mx_amz's lib/drawer.ts.)
import type { DrawerTarget } from './mx/match';

const ROW_ATTR = 'data-becu-mx-spliit';
const TEAL = 'rgb(0, 124, 137)'; // Money Manager's link/button color
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Oct 21, 2026" -> "2026-10-21"
export function parseDate(text: string): string | undefined {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  const month = m ? MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
  if (!m || month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

// "-$1,234.56" -> -123456
export function parseCents(text: string): number | undefined {
  const m = /(-|−)?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(text);
  if (!m) return undefined;
  const cents = Math.round(Number(m[2]!.replace(/,/g, '')) * 100);
  return m[1] ? -cents : cents;
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

// The `.mx-display-input` row whose label reads `name`.
function field(drawer: Element, name: string): Element | undefined {
  for (const label of drawer.querySelectorAll('label')) {
    if (text(label) === name) return label.closest('.mx-display-input') ?? undefined;
  }
  return undefined;
}

const inputValue = (row: Element | undefined) => row?.querySelector('input')?.value.trim() ?? '';

export function readDrawer(drawer: Element): DrawerTarget | undefined {
  const cents = parseCents(text(drawer.querySelector('[data-testid="media-block-right-container"]')));
  const date = parseDate(text(drawer.querySelector('[aria-label^="Select a Date"]')));
  if (cents === undefined || !date) return undefined;
  const payeeRow = field(drawer, 'Payee');
  // The bank's description sits between the Payee and Date rows.
  const next = payeeRow?.nextElementSibling;
  const feed = next && !next.matches('.mx-display-input') ? text(next) : '';
  const left = drawer.querySelector('[data-testid="media-block-left-container"]');
  return {
    cents: Math.abs(cents),
    date,
    payee: inputValue(payeeRow) || text(left?.querySelector('h2')),
    feed,
    account: text(left?.querySelector('span')),
    memo: inputValue(field(drawer, 'Memo')),
    category: text(drawer.querySelector('[data-testid="Category-Select-Button"]')),
  };
}

export const targetKey = (t: DrawerTarget) => [t.cents, t.date, t.payee, t.account, t.memo].join('|');

export type ButtonState = { label: string; title?: string; done?: boolean; busy?: boolean };

export function setButton(button: HTMLButtonElement, state: ButtonState) {
  button.textContent = state.label;
  button.title = state.title ?? '';
  button.style.background = state.done ? TEAL : 'transparent';
  button.style.color = state.done ? 'rgb(255, 255, 255)' : TEAL;
  button.style.opacity = state.busy ? '0.7' : '1';
}

function buildRow(onClick: () => void): { row: HTMLElement; button: HTMLButtonElement } {
  const row = document.createElement('div');
  row.setAttribute(ROW_ATTR, '');
  Object.assign(row.style, { padding: '0 20px 15px', background: 'rgb(255, 255, 255)' });
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Add this transaction to Spliit');
  Object.assign(button.style, {
    padding: '6px 14px',
    border: `1px solid ${TEAL}`,
    borderRadius: '4px',
    font: '13px InterSemibold, Helvetica, Arial, sans-serif',
    cursor: 'pointer',
  });
  setButton(button, { label: 'Add to Spliit' });
  button.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  row.append(button);
  return { row, button };
}

const buttons = new WeakMap<Element, HTMLButtonElement>();

// `onShow` runs whenever a drawer shows a different transaction, so the
// caller can look it up and label the button; `check(true)` runs it again
// with `recheck` set.
export function watchDrawer(
  onShow: (target: DrawerTarget, button: HTMLButtonElement, recheck: boolean) => void,
  onClick: (target: DrawerTarget, button: HTMLButtonElement) => void,
) {
  const check = (force = false) => {
    for (const drawer of document.querySelectorAll('.mx-drawer')) {
      if (!/Transaction Details/i.test(text(drawer.querySelector('header h2')))) continue;
      const target = readDrawer(drawer);
      let row = drawer.querySelector<HTMLElement>(`[${ROW_ATTR}]`);
      if (!target) {
        row?.remove();
        continue;
      }
      if (!row) {
        const media = drawer.querySelector('[data-testid="media-block-right-container"]')?.closest('ul');
        if (!media) continue;
        const built = buildRow(() => {
          const current = readDrawer(drawer);
          if (current) onClick(current, built.button);
        });
        row = built.row;
        buttons.set(row, built.button);
        media.after(row);
      }
      const key = targetKey(target);
      const changed = row.dataset.key !== key;
      if (force || changed) {
        row.dataset.key = key;
        const button = buttons.get(row)!;
        if (changed) delete button.dataset.matched;
        onShow(target, button, !changed);
      }
    }
  };
  new MutationObserver(() => check()).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value'] });
  check();
  return check;
}
