import { BrowserWindow, Notification } from 'electron';
import type { WebContents } from 'electron';
import { readMainSettings } from '@shared/schemas/settings';
import { getSettings } from '../../repositories/settings-repository';
import { getMainTranslator } from '../../language';
import { backgroundQueue, scanKind } from '../tasks/background-queue';

export interface LibraryChange {
  added?: number;
  updated?: number;
  removed?: number;
}

/** Changes that follow each other within this time are told in one notification: a scan of a new folder stores a batch at a time */
const quietTime = 10_000;

const totals = { added: 0, updated: 0, removed: 0 };
let timer: ReturnType<typeof setTimeout> | undefined;
// a reference is kept until the notification is closed, as a collected one does not answer a click
const shown = new Set<Notification>();

const take = () => {
  const taken = { ...totals };
  totals.added = totals.updated = totals.removed = 0;
  return taken;
};

const summarize = ({ added, updated, removed }: typeof totals) => {
  const { t } = getMainTranslator();
  const parts = [
    added > 0 && t('libraryChanges.added', { count: added }),
    updated > 0 && t('libraryChanges.updated', { count: updated }),
    removed > 0 && t('libraryChanges.removed', { count: removed }),
  ].filter((part) => part !== false);

  return t('libraryChanges.summary', { changes: parts.join(', ') });
};

const showWindow = (sender: WebContents) => {
  const window = BrowserWindow.fromWebContents(sender);
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
};

const notify = (sender: WebContents, changes: typeof totals) => {
  const notification = new Notification({ title: getMainTranslator().t('app.name'), body: summarize(changes) });
  shown.add(notification);
  notification.on('click', () => showWindow(sender));
  notification.on('close', () => shown.delete(notification));
  notification.show();
};

const mayNotify = async (sender: WebContents) => {
  const window = BrowserWindow.fromWebContents(sender);
  if (!global._database || !Notification.isSupported() || !window || window.isDestroyed() || window.isFocused()) return false;
  return readMainSettings(await getSettings(global._database)).notifyLibraryChanges !== false;
};

const flush = async (sender: WebContents) => {
  timer = undefined;
  // the scan that goes on has more to tell
  if (backgroundQueue.isBusy(scanKind)) {
    timer = setTimeout(() => flush(sender).catch(console.error), quietTime);
    return;
  }

  const changes = take();
  if (changes.added + changes.updated + changes.removed === 0 || !(await mayNotify(sender))) return;
  notify(sender, changes);
};

/** Notes what a scan changed in the library; once nothing changed for a while and no scan goes on, one notification tells it, unless the window is in front or the notifications are turned off. See docs/app/library-notifications.md */
export const recordLibraryChange = (sender: WebContents, { added = 0, updated = 0, removed = 0 }: LibraryChange) => {
  if (added + updated + removed === 0) return;

  totals.added += added;
  totals.updated += updated;
  totals.removed += removed;
  clearTimeout(timer);
  timer = setTimeout(() => flush(sender).catch(console.error), quietTime);
};
