import type { UserPreferences } from '../domain/types';
import { normalizePreferences } from '../domain/normalize';
import { kv } from './db';

const KEY = 'preferences';

export async function loadPreferences(): Promise<UserPreferences> {
  return normalizePreferences(await kv.get<UserPreferences>(KEY));
}

export async function savePreferences(p: UserPreferences): Promise<UserPreferences> {
  const next = normalizePreferences(p);
  await kv.set(KEY, next);
  return next;
}
