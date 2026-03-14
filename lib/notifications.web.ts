/**
 * Web stub for notifications.
 * Push notifications require native; on web we provide no-op implementations.
 * This file is only used when building for web - native builds use notifications.ts.
 */

export async function registerForPushNotifications(_uid?: string): Promise<string | null> {
  return null;
}

export async function sendPushNotification(
  _recipientUserId: string,
  _title: string,
  _body: string,
  _data?: Record<string, unknown>
): Promise<void> {
  // no-op - push requires native
}

export async function sendLocalNotification(
  _title: string,
  _body: string,
  _data?: any
): Promise<void> {
  // no-op
}

export function addNotificationListener(
  _callback: (notification: any) => void
): { remove: () => void } {
  return { remove: () => {} };
}

export function addNotificationResponseListener(
  _callback: (response: any) => void
): { remove: () => void } {
  return { remove: () => {} };
}
