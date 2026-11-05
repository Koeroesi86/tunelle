/** Added to the page before its own code runs (page.addInitScript): the app announces each track with a desktop notification, which a run of tests must not show on the desktop of the person running them */
export const installNoNotifications = () => {
  class SilentNotification {
    static permission: NotificationPermission = 'denied';
    static requestPermission = () => Promise.resolve<NotificationPermission>('denied');
    onclick: (() => void) | null = null;
    close = () => undefined;
  }
  Object.defineProperty(window, 'Notification', { value: SilentNotification, configurable: true, writable: true });
};
