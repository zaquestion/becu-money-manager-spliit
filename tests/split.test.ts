import { describe, expect, it } from 'vitest';
import { apportion, computeSplit } from '@/lib/spliit/split';

const values = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('split', () => {
  it('apportions cents so parts add up', () => {
    expect(apportion(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(apportion(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
    expect(apportion(100, [0, 0])).toEqual([0, 0]);
  });

  it('splits evenly with shares of 100, as the Spliit form sends', () => {
    const r = computeSplit({ mode: 'EVENLY', amountCents: 1873, values: values({ a: '', b: '' }) });
    expect(r.ok && r.paidFor).toEqual([
      { participant: 'a', shares: 100 },
      { participant: 'b', shares: 100 },
    ]);
    expect(r.ok && [...r.cents.values()]).toEqual([937, 936]);
  });

  it('scales shares by 100', () => {
    const r = computeSplit({ mode: 'BY_SHARES', amountCents: 900, values: values({ a: '2', b: '1' }) });
    expect(r.ok && r.paidFor).toEqual([
      { participant: 'a', shares: 200 },
      { participant: 'b', shares: 100 },
    ]);
    expect(r.ok && [...r.cents.values()]).toEqual([600, 300]);
    expect(computeSplit({ mode: 'BY_SHARES', amountCents: 900, values: values({ a: '0' }) }).ok).toBe(false);
  });

  it('takes amounts in dollars and sends cents, which must add up', () => {
    const r = computeSplit({ mode: 'BY_AMOUNT', amountCents: 1873, values: values({ a: '10', b: '8.73' }) });
    expect(r.ok && r.paidFor).toEqual([
      { participant: 'a', shares: 1000 },
      { participant: 'b', shares: 873 },
    ]);
    const off = computeSplit({ mode: 'BY_AMOUNT', amountCents: 1873, values: values({ a: '10', b: '8' }) });
    expect(off).toEqual({ ok: false, error: 'Amounts add up to $18.00; $0.73 left' });
  });

  it('refuses what Spliit would reject', () => {
    expect(computeSplit({ mode: 'EVENLY', amountCents: 100, values: new Map() }).ok).toBe(false);
    expect(computeSplit({ mode: 'EVENLY', amountCents: 0, values: values({ a: '' }) }).ok).toBe(false);
    expect(computeSplit({ mode: 'BY_AMOUNT', amountCents: -100, values: values({ a: '1' }) }).ok).toBe(false);
    expect(computeSplit({ mode: 'EVENLY', amountCents: -100, values: values({ a: '' }) }).ok).toBe(true);
  });
});
