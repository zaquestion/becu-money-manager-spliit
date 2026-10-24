import { describe, expect, it } from 'vitest';
import { buildNotes, fingerprintMarker, guidMarker, memoWithSpliit, parseNotes, spliitMemo } from '@/lib/spliit/notes';
import { tx } from './fixtures';

describe('notes', () => {
  it('round-trips the markers and the date added', () => {
    const notes = buildNotes('Split with roommates', tx, '2026-10-23');
    expect(notes).toBe(
      [
        'Split with roommates',
        '',
        'Added from BECU Money Manager on 2026-10-23',
        'AMAZON MKTPLACE PMTS · Amazon Prime Rewards Visa Signature · $18.73 · 2026-10-21',
        '[mx:TRN-f587d005-d398-4ddb-a73e-e24c4609cfcd] [mx-fp:ACT-5adea6ca-6bac-4d55-a43a-f60720613f09:-1873]',
      ].join('\n'),
    );
    expect(parseNotes(notes)).toEqual({ guids: [tx.guid], addedOn: '2026-10-23' });
    expect(notes).toContain(guidMarker(tx.guid));
    expect(notes).toContain(fingerprintMarker(tx));
  });

  it('notes that it was added while pending', () => {
    expect(buildNotes('', { ...tx, pending: true }, '2026-10-23').split('\n')[1]).toBe(
      'AMAZON MKTPLACE PMTS · Amazon Prime Rewards Visa Signature · $18.73 · 2026-10-21 · pending',
    );
  });

  it('marks refunds as money in', () => {
    expect(fingerprintMarker({ ...tx, credit: true })).toBe(`[mx-fp:${tx.accountGuid}:1873]`);
    expect(buildNotes('', { ...tx, credit: true }, '2026-10-23').split('\n')[0]).toBe('Added from BECU Money Manager on 2026-10-23');
  });

  it('ignores notes that are not ours', () => {
    expect(parseNotes('dinner')).toEqual({ guids: [], addedOn: undefined });
    expect(parseNotes(null).guids).toEqual([]);
  });

  it('appends the Spliit note to the memo once', () => {
    const url = 'https://spliit.app/groups/g/expenses/e/edit';
    const note = spliitMemo('2026-10-23', 'House', url);
    expect(note).toBe(`Spliit 2026-10-23 (House): ${url}`);
    expect(memoWithSpliit('', note, url)).toBe(note);
    expect(memoWithSpliit('batteries', note, url)).toBe(`batteries · ${note}`);
    expect(memoWithSpliit(`batteries · ${note}`, note, url)).toBe(`batteries · ${note}`);
  });
});
