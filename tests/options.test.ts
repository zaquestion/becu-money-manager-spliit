import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fake, flush } from './harness';

vi.mock('@/lib/messages', async () => (await import('./harness')).messagesModule);
vi.mock('@/lib/store', async (load) => (await import('./harness')).storeModule(await load()));

describe('settings page', () => {
  it('adds and edits a split rule for a group', async () => {
    const html = readFileSync(join(import.meta.dirname, '..', 'entrypoints', 'options', 'index.html'), 'utf8');
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/, '');
    await import('@/entrypoints/options/main');
    await flush();

    const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
    const choose = (sel: string, value: string) => {
      const select = document.querySelector<HTMLSelectElement>(sel)!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    expect(document.querySelector('.rules .hint')!.textContent).toMatch(/^None/);

    button('Add rule').click();
    choose('.draft select[aria-label="Category"]', 'g:Food and Drink');
    choose('.draft select[aria-label="Split"]', 'BY_SHARES');
    const sam = document.querySelector<HTMLInputElement>('.draft input[aria-label="Sam\'s shares"]')!;
    sam.value = '2';
    sam.dispatchEvent(new Event('input'));
    button('Save rule').click();
    await flush();

    expect(fake.settings.groups[0]!.rules).toEqual([{ match: { grouping: 'Food and Drink' }, mode: 'BY_SHARES', shares: { 'p-me': 1, 'p-sam': 2 } }]);
    expect(document.querySelector('.rule')!.textContent).toBe('All Food and Drink — by shares: Me 1 · Sam 2EditRemove');

    // Editing it onto another category moves it rather than copying it.
    button('Edit').click();
    choose('.draft select[aria-label="Category"]', 'c:9');
    button('Save rule').click();
    await flush();
    expect(fake.settings.groups[0]!.rules!.map((r) => r.match)).toEqual([{ category: 9 }]);
  });
});
