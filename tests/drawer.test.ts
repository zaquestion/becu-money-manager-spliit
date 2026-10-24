import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDrawer, watchDrawer } from '@/lib/drawer';

const file = join(import.meta.dirname, '..', 'samples', 'transaction_details.html');

describe.skipIf(!existsSync(file))('details drawer', () => {
  it('reads what the drawer shows and adds the button', () => {
    document.body.innerHTML = readFileSync(file, 'utf8');
    const drawer = document.querySelector('.mx-drawer')!;
    expect(readDrawer(drawer)).toEqual({
      cents: 1873,
      date: '2026-10-21',
      payee: 'Amazon',
      feed: 'AMAZON MKTPLACE PMTS',
      account: 'Amazon Prime Rewards Visa Signature',
      memo: '(item name)',
      category: 'Service & Parts',
    });

    const shown: string[] = [];
    let clicked = 0;
    const recheck = watchDrawer(
      (t, _b, again) => shown.push(`${t.payee}${again ? ' again' : ''}`),
      () => clicked++,
    );
    const button = document.querySelector<HTMLButtonElement>('[data-becu-mx-spliit] button')!;
    expect(button.textContent).toBe('Add to Spliit');
    expect(shown).toEqual(['Amazon']);
    recheck(true);
    expect(shown).toEqual(['Amazon', 'Amazon again']);
    button.click();
    expect(clicked).toBe(1);
    expect(document.querySelectorAll('[data-becu-mx-spliit]').length).toBe(1);
  });
});
