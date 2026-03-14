import * as Notifications from 'expo-notifications';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase/config';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(uid?: string): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('Failed to get push token - permission not granted');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (__DEV__) console.log('Push notification token:', token);

    if (uid) {
      await setDoc(doc(db, 'pushTokens', uid), { token, updatedAt: Date.now() });
    }

    return token;
  } catch (error) {
    console.log('Error getting push notification token:', error);
    return null;
  }
}

/**
 * Send a push notification to another user's device via Expo's push relay.
 * Fetches the recipient's token from `pushTokens/{recipientUserId}` and POSTs
 * to Expo's push API. Silently no-ops if the token is not found.
 */
export async function sendPushNotification(
  recipientUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'pushTokens', recipientUserId));
    if (!snap.exists()) return;

    const { token } = snap.data() as { token: string };
    if (!token) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: token, title, body, data }),
    });
  } catch (error) {
    console.log('Failed to send push notification:', error);
  }
}

export async function sendLocalNotification(title: string, body: string, data?: any): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
  } catch (error) {
    console.log('Failed to schedule local notification:', error);
  }
}

export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
