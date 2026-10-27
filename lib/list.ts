// The Transactions tab's search bar and list. A "Sum and Split" button goes
// to the right of the search bar, which is narrowed to make room. The list is
// virtualized (react-virtualized): only the rows in view are in the DOM, so
// reading all of them means scrolling through it.
import { TEAL, parseCents, parseDate, text } from './drawer';
import type { DrawerTarget } from './mx/match';

const BAR = '[data-testid="search-bar"]';
const SEARCH = 'input[aria-label="Search Transactions"]';
const GRID = '[role="grid"][aria-label="transactions list"]';
const ROW = '[data-testid="transaction-list-row"]';
const BUTTON_ATTR = 'data-becu-mx-spliit-sum';
const BUTTON_WIDTH = 140;
const BAR_WIDTH = `calc(90% - ${BUTTON_WIDTH + 12}px)`; // the app's is 90%

const RANGE = '.mx-date-range-picker';

// The date filter, from the picker's text ("Sep 1, 2026 - Sep 30, 2026") or
// its button's label ("…September 1st, 2026 to September 30th, 2026…").
export function dateRange(): { start: string; end: string } | undefined {
  const picker = document.querySelector(RANGE);
  if (!picker) return undefined;
  const spans = [...picker.querySelectorAll('.mx-date-range-picker-selected-date-text span')].map((span) => parseDate(text(span)));
  let [start, end] = spans.filter(Boolean);
  if (!start || !end) {
    const label = picker.querySelector('button[aria-label]')?.getAttribute('aria-label') ?? '';
    const m = /([A-Z][a-z]+ \d{1,2}\w*, \d{4}) to ([A-Z][a-z]+ \d{1,2}\w*, \d{4})/.exec(label);
    [start, end] = [parseDate(m?.[1] ?? ''), parseDate(m?.[2] ?? '')];
  }
  return start && end ? { start, end } : undefined;
}

export const searchTerm = () => document.querySelector<HTMLInputElement>(SEARCH)?.value.trim() ?? '';

// A list row's button: its aria-label reads "Transaction, Date: September
// 26th, 2026, Payee: …, Category: …, Account: …, Amount: $111.92".
export function readRow(row: Element): DrawerTarget | undefined {
  const label = row.getAttribute('aria-label') ?? '';
  const date = parseDate(/Date: ([^,]+, \d{4})/.exec(label)?.[1] ?? '');
  const cents = parseCents(text(row.querySelector('[data-testid="credit-debit-amount"]')));
  if (!date || cents === undefined) return undefined;
  const payee = row.querySelector('h2');
  return {
    cents: Math.abs(cents),
    date,
    payee: payee?.getAttribute('title') || text(payee),
    feed: '',
    account: /Account: (.*), Amount: /.exec(label)?.[1] ?? '',
    memo: '',
    category: text(row.querySelector('[data-testid="transaction-category-cell"]')),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 80));

// Every row of the list, top to bottom, scrolling it through and back.
export async function collectRows(): Promise<DrawerTarget[]> {
  const grid = document.querySelector<HTMLElement>(GRID);
  if (!grid) return [];
  const rows = new Map<number, DrawerTarget>(); // by the row's offset in the list
  const read = () => {
    for (const cell of grid.querySelectorAll(ROW)) {
      const top = parseFloat(cell.closest<HTMLElement>('[role="row"]')?.style.top ?? '');
      const target = readRow(cell);
      if (target && !Number.isNaN(top)) rows.set(top, target);
    }
  };
  const start = grid.scrollTop;
  if (start) {
    grid.scrollTop = 0;
    await settle();
  }
  read();
  while (grid.scrollTop + grid.clientHeight < grid.scrollHeight) {
    const before = grid.scrollTop;
    grid.scrollTop = before + Math.max(grid.clientHeight - 50, 40);
    await settle();
    if (grid.scrollTop === before) break;
    read();
  }
  grid.scrollTop = start;
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, target]) => target);
}

function buildButton(onClick: (term: string) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(BUTTON_ATTR, '');
  button.setAttribute('aria-haspopup', 'dialog');
  button.textContent = 'Sum and Split';
  Object.assign(button.style, {
    flex: 'none',
    width: `${BUTTON_WIDTH}px`,
    height: '40px',
    marginLeft: '12px',
    border: `1px solid ${TEAL}`,
    borderRadius: '4px',
    background: 'rgb(255, 255, 255)',
    color: TEAL,
    font: '13px InterSemibold, Helvetica, Arial, sans-serif',
    whiteSpace: 'nowrap',
  });
  button.addEventListener('click', (e) => {
    e.preventDefault();
    const term = searchTerm();
    if (term) onClick(term);
  });
  return button;
}

function update(button: HTMLButtonElement) {
  const term = searchTerm();
  button.disabled = !term;
  button.style.opacity = term ? '1' : '0.5';
  button.style.cursor = term ? 'pointer' : 'default';
  button.title = term
    ? `Add the transactions listed for “${term}” to Spliit as one expense`
    : 'Search for something first (e.g. a store), then sum what’s listed into one Spliit expense';
}

export function watchSearchBar(onClick: (term: string) => void) {
  const check = () => {
    const bar = document.querySelector(BAR);
    const box = bar?.firstElementChild as HTMLElement | null | undefined;
    if (!bar || !box) return;
    let button = bar.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`);
    if (!button) {
      button = buildButton(onClick);
      bar.append(button);
    }
    if (box !== button && box.style.width !== BAR_WIDTH) box.style.width = BAR_WIDTH;
    update(button);
  };
  // The search box is a controlled input: typing fires input events, and
  // React keeps its value attribute in step (Clear Search included).
  document.addEventListener('input', check, true);
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
  check();
}
