// Settings in extension storage, shared by the Money Manager UI, the
// settings page and the background worker.
import { browser } from 'wxt/browser';
import type { SplitRule } from './rules';
import type { SplitMode } from './spliit/split';

export interface GroupRef {
  origin: string; // e.g. https://spliit.app
  id: string;
  name: string;
  me?: string; // participant id: "paid by" default and who the activity log credits
  rules?: SplitRule[]; // split by Spliit category, set on the settings page
}

export interface LastSplit {
  mode: SplitMode;
  participants: string[];
}

export interface Settings {
  groups: GroupRef[];
  lastGroup?: string; // `${origin} ${id}`
  writeMemo: boolean;
  lastSplit: Record<string, LastSplit>; // group key -> last split used
  categories: Record<string, number>; // MX category name (lowercase) -> Spliit category id
}

const DEFAULTS: Settings = { groups: [], writeMemo: true, lastSplit: {}, categories: {} };

export const groupKey = (g: Pick<GroupRef, 'origin' | 'id'>) => `${g.origin} ${g.id}`;

export async function loadSettings(): Promise<Settings> {
  return (await browser.storage.local.get(structuredClone(DEFAULTS) as unknown as Record<string, unknown>)) as unknown as Settings;
}

export async function saveSettings(changes: Partial<Settings>) {
  await browser.storage.local.set(changes);
}

export const DEFAULT_ORIGIN = 'https://spliit.app';

// Origins other than spliit.app need an optional host permission.
export const originPattern = (origin: string) => `${origin}/*`;
