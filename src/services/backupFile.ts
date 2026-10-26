import { exportBackup } from './backupService';
import { kv } from './db';

/**
 * Enregistrement du fichier de sauvegarde (partagé entre l'accueil et le Profil).
 * Sur iPhone, le menu de partage permet de l'enregistrer dans Fichiers / iCloud Drive ;
 * ailleurs, le fichier est téléchargé.
 */
const LAST_KEY = 'backup:last';
const SNOOZE_KEY = 'backup:snooze';
/** au-delà, un rappel discret est affiché sur l'accueil */
export const BACKUP_REMINDER_DAYS = 14;

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export async function saveBackupFile(): Promise<SaveResult> {
  const blob = await exportBackup();
  const name = `my-wardrobe-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  let result: SaveResult | null = null;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde My Wardrobe' });
      result = 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  if (!result) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    result = 'downloaded';
  }
  await kv.set(LAST_KEY, new Date().toISOString()).catch(() => undefined);
  return result;
}

export async function lastBackupDate(): Promise<string | null> {
  return (await kv.get<string>(LAST_KEY).catch(() => undefined)) ?? null;
}

/** Faut-il rappeler de faire une sauvegarde ? (fonction pure, testée) */
export function needsBackupReminder(last: string | null, snoozedUntil: string | null, now = new Date()): boolean {
  if (snoozedUntil && new Date(snoozedUntil) > now) return false;
  if (!last) return true;
  return now.getTime() - new Date(last).getTime() > BACKUP_REMINDER_DAYS * 86400000;
}

export async function backupReminderDue(): Promise<{ due: boolean; last: string | null }> {
  const [last, snooze] = await Promise.all([lastBackupDate(), kv.get<string>(SNOOZE_KEY).catch(() => undefined)]);
  return { due: needsBackupReminder(last, snooze ?? null), last };
}

/** « Plus tard » : le rappel ne revient pas avant 3 jours. */
export async function snoozeBackupReminder(days = 3): Promise<void> {
  await kv.set(SNOOZE_KEY, new Date(Date.now() + days * 86400000).toISOString());
}
