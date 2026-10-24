// Turns the dialog's split choices into Spliit's `paidFor`, in the units the
// Spliit form itself sends after its own conversion (expense-form.tsx):
// EVENLY and BY_SHARES shares are ×100, BY_AMOUNT shares are minor units.

export type SplitMode = 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT';

export interface PaidFor {
  participant: string;
  shares: number;
}

export interface SplitInput {
  mode: SplitMode;
  amountCents: number; // signed: negative for a refund
  // Participant id -> what was typed: ignored for EVENLY, a share count for
  // BY_SHARES, dollars for BY_AMOUNT. Only included participants are listed.
  values: Map<string, string>;
}

export type SplitResult = { ok: true; paidFor: PaidFor[]; cents: Map<string, number> } | { ok: false; error: string };

const parseNumber = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return text.trim() === '' || Number.isNaN(n) ? undefined : n;
};

// Shares a total by weight, rounding to cents so the parts add up exactly
// (largest remainder first). Only used to preview who owes what.
export function apportion(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const sign = totalCents < 0 ? -1 : 1;
  const total = Math.abs(totalCents);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left-- <= 0) break;
    parts[i]! += 1;
  }
  return parts.map((p) => p * sign);
}

export function computeSplit({ mode, amountCents, values }: SplitInput): SplitResult {
  const ids = [...values.keys()];
  if (!ids.length) return { ok: false, error: 'Pick at least one person to split with' };
  if (amountCents === 0) return { ok: false, error: 'The amount can’t be zero' };

  if (mode === 'EVENLY') {
    const cents = apportion(amountCents, ids.map(() => 1));
    return {
      ok: true,
      paidFor: ids.map((participant) => ({ participant, shares: 100 })),
      cents: new Map(ids.map((id, i) => [id, cents[i]!])),
    };
  }

  if (mode === 'BY_SHARES') {
    const shares: number[] = [];
    for (const id of ids) {
      const n = parseNumber(values.get(id) ?? '');
      if (n === undefined || n <= 0) return { ok: false, error: 'Shares must be numbers above zero' };
      shares.push(Math.round(n * 100));
    }
    const cents = apportion(amountCents, shares);
    return {
      ok: true,
      paidFor: ids.map((participant, i) => ({ participant, shares: shares[i]! })),
      cents: new Map(ids.map((id, i) => [id, cents[i]!])),
    };
  }

  // BY_AMOUNT: Spliit rejects shares <= 0, so it can't describe a refund.
  if (amountCents < 0) return { ok: false, error: 'Split a refund evenly or by shares' };
  const amounts: number[] = [];
  for (const id of ids) {
    const n = parseNumber(values.get(id) ?? '');
    if (n === undefined || n <= 0) return { ok: false, error: 'Amounts must be above zero' };
    amounts.push(Math.round(n * 100));
  }
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum !== amountCents) {
    const diff = (amountCents - sum) / 100;
    return {
      ok: false,
      error: `Amounts add up to $${(sum / 100).toFixed(2)}; ${diff > 0 ? `$${diff.toFixed(2)} left` : `$${(-diff).toFixed(2)} over`}`,
    };
  }
  return {
    ok: true,
    paidFor: ids.map((participant, i) => ({ participant, shares: amounts[i]! })),
    cents: new Map(ids.map((id, i) => [id, amounts[i]!])),
  };
}
