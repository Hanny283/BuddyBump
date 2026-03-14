import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { Linking, Platform } from 'react-native';
import {
  startMonitoring,
  stopMonitoring,
  blockSelection,
  resetBlocks,
  updateShield,
  updateShieldWithId,
  userDefaultsSet,
  setFamilyActivitySelectionId,
  getActivities,
} from '../device-activity';
import { db } from '../firebase/config';
import { getFamilyActivitySelection } from '../screentime';
import { sendPushNotification } from '../notifications';
import { CreateLockInput, InviteLockInput, Lock, UnlockRequest } from './types';
import { formatUserName } from './utils';

const LOCKS_COLLECTION = 'locks';
const UNLOCK_REQUESTS_COLLECTION = 'unlockRequests';
const BLOCK_EVENTS_COLLECTION = 'blockEvents';

function nowMs(): number {
  return Date.now();
}

/**
 * Generates a cryptographically random invite ID.
 * Uses crypto.getRandomValues() — unlike Math.random() this is unpredictable
 * and safe for use as a security token in deep-link invite URLs.
 */
function generateInviteId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export async function createLockDraft(input: CreateLockInput): Promise<Lock> {
  const inviteId = generateInviteId();
  const inviteUrl = `timesync://lock/${inviteId}`;
  const data = {
    appTokens: input.appTokens,
    dailyMinutes: input.dailyMinutes,
    creatorUserId: input.creatorUserId,
    holderUserId: null,
    status: 'pending' as const,
    inviteId,
    inviteUrl,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  const ref = await addDoc(collection(db, LOCKS_COLLECTION), data);
  return { id: ref.id, ...data } as unknown as Lock;
}

export async function acceptLock(lockId: string, recipientUserId: string): Promise<void> {
  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lock not found');

  const lock = snap.data() as Lock;

  // Prevent double-accepting
  if (lock.status !== 'pending') {
    console.warn(`⚠️ Attempted to accept lock ${lockId} but status is '${lock.status}', not 'pending'`);
    throw new Error(`Lock is already ${lock.status} and cannot be accepted again`);
  }

  // Update Firestore — this will trigger monitoring to start on the creator's device
  await updateDoc(ref, {
    holderUserId: recipientUserId,
    status: 'active',
    updatedAt: nowMs(),
  });
}

// This function is called on the CREATOR's device when their lock becomes active.
// NOTE: In a self-lock / accountability-buddy scenario this restricts the creator's
// own apps, which is intentional. For true parental-control cross-device restrictions
// this monitoring would need to run on the holder's device via a native extension.
export async function startMonitoringForCreator(lockId: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lock not found');

  const lock = snap.data() as Lock;

  // Check if monitoring is already started for this lock
  const activityName = `lock_${lockId}`;
  const activities = getActivities();
  if (activities.includes(activityName)) {
    return;
  }

  try {
    // Use the appTokens from the lock document (set by creator)
    const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;

    if (!selectionToken) {
      console.error('❌ No app tokens found in lock:', lockId);
      throw new Error('No apps were selected for this lock.');
    }

    const eventName = `${activityName}_threshold`;

    // Store the family activity selection so the extension can access it
    setFamilyActivitySelectionId({
      id: lockId,
      familyActivitySelection: selectionToken,
    });

    // Register actions to execute when threshold is reached
    const actionsKey = `actions_for_${activityName}_eventDidReachThreshold_${eventName}`;
    const actions = [
      {
        type: 'blockSelection',
        familyActivitySelectionId: lockId,
        shieldId: lockId,
      },
    ];
    userDefaultsSet(actionsKey, actions);

    // IMPORTANT: The Swift extension expects flat keys, not nested objects!
    // AND Swift divides RGB by 255, so we MUST send values in 0-255 range!
    const shieldConfig = {
      backgroundColor: { red: 28, green: 28, blue: 31, alpha: 1 },
      title: '⏱️ Time\'s Up!',
      titleColor: { red: 255, green: 255, blue: 255, alpha: 1 },
      subtitle: `You've used your ${lock.dailyMinutes} minutes for today.`,
      subtitleColor: { red: 230, green: 230, blue: 230, alpha: 1 },
      primaryButtonLabel: '🔓 Request Unlock',
      primaryButtonLabelColor: { red: 255, green: 255, blue: 255, alpha: 1 },
      primaryButtonBackgroundColor: { red: 102, green: 120, blue: 140, alpha: 1 },
    };

    const shieldActions = {
      primary: {
        type: 'openUrl',
        url: `timesync://request-unlock/${lockId}`,
      },
    };

    updateShieldWithId(shieldConfig, shieldActions, lockId);
    updateShield(shieldConfig, shieldActions);

    await startMonitoring(
      activityName,
      {
        intervalStart: { hour: 0, minute: 0, second: 0 },
        intervalEnd: { hour: 23, minute: 59, second: 59 },
        repeats: true,
      },
      [
        {
          eventName,
          familyActivitySelection: selectionToken,
          threshold: {
            minute: lock.dailyMinutes,
          },
          includesPastActivity: false,
        },
      ]
    );
  } catch (error) {
    console.error('Failed to activate Screen Time monitoring on creator\'s device:', error);
    throw error;
  }
}

async function logBlockEvent(lock: Lock): Promise<void> {
  try {
    const now = new Date();
    await addDoc(collection(db, BLOCK_EVENTS_COLLECTION), {
      userId: lock.creatorUserId,
      lockId: lock.id,
      dailyMinutes: lock.dailyMinutes,
      blockedAt: nowMs(),
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
    });
  } catch (error) {
    console.warn('⚠️ Could not log block event:', error);
  }
}

export async function blockLock(lockId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    const lockRef = doc(db, LOCKS_COLLECTION, lockId);
    const lockSnap = await getDoc(lockRef);
    if (!lockSnap.exists()) throw new Error('Lock not found');
    const lock = { id: lockSnap.id, ...(lockSnap.data() as Lock) };

    const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
    if (!selectionToken) throw new Error('No app tokens found');

    blockSelection({ familyActivitySelection: selectionToken });

    try {
      await updateDoc(lockRef, {
        isBlocked: true,
        blockedAt: nowMs(),
        updatedAt: nowMs(),
      });
      await logBlockEvent({ id: lockId, ...(lockSnap.data() as Lock) });
    } catch (firestoreError) {
      console.warn('⚠️ Could not update Firestore (permissions?), but apps are still blocked:', firestoreError);
    }
  } catch (error) {
    console.error('Failed to block apps:', error);
    throw error;
  }
}

export async function unblockLock(lockId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    const lockRef = doc(db, LOCKS_COLLECTION, lockId);
    const lockSnap = await getDoc(lockRef);
    if (!lockSnap.exists()) {
      console.warn('Lock not found, but clearing blocks anyway');
      resetBlocks();
      return;
    }

    resetBlocks();

    try {
      await updateDoc(lockRef, {
        isBlocked: false,
        blockedAt: null,
        updatedAt: nowMs(),
      });
    } catch (firestoreError) {
      console.warn('⚠️ Could not update Firestore (permissions?), but apps are unblocked:', firestoreError);
    }
  } catch (error) {
    console.error('Failed to unblock apps:', error);
    try {
      resetBlocks();
    } catch (e) {
      console.error('Failed to clear blocks:', e);
    }
    throw error;
  }
}

export async function getLock(lockId: string): Promise<Lock | null> {
  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Lock) };
}

export async function getLockByInviteId(inviteId: string): Promise<Lock | null> {
  const q = query(collection(db, LOCKS_COLLECTION), where('inviteId', '==', inviteId));
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const lockDoc = snaps.docs[0];
  return { id: lockDoc.id, ...(lockDoc.data() as Lock) };
}

export async function listLocksForCreator(userId: string): Promise<Lock[]> {
  const q = query(collection(db, LOCKS_COLLECTION), where('creatorUserId', '==', userId));
  const snaps = await getDocs(q);
  return snaps.docs
    .map(d => ({ id: d.id, ...(d.data() as Lock) }))
    .filter(lock => lock.status !== 'deleted');
}

export async function listLocksForHolder(userId: string): Promise<Lock[]> {
  const q = query(collection(db, LOCKS_COLLECTION), where('holderUserId', '==', userId));
  const snaps = await getDocs(q);
  return snaps.docs
    .map(d => ({ id: d.id, ...(d.data() as Lock) }))
    .filter(lock => lock.status !== 'deleted');
}

export async function cancelLock(lockId: string): Promise<void> {
  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lock not found');

  const lock = snap.data() as Lock;

  await updateDoc(ref, {
    status: 'cancelled',
    updatedAt: nowMs(),
  });

  if (Platform.OS === 'ios') {
    try {
      const activityName = `lock_${lockId}`;
      stopMonitoring([activityName]);
      resetBlocks();

      if (lock.isBlocked) {
        await updateDoc(ref, {
          isBlocked: false,
          blockedAt: null,
        });
      }
    } catch (error) {
      console.error('❌ Failed to clean up Screen Time:', error);
    }
  }
}

export async function deleteLock(lockId: string, userId: string): Promise<void> {
  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error('Lock not found');
  }

  const lock = snap.data() as Lock;

  const isHolder = lock.holderUserId === userId;
  const isCreatorOfCancelledLock = lock.creatorUserId === userId && lock.status === 'cancelled';

  if (!isHolder && !isCreatorOfCancelledLock) {
    throw new Error('You cannot delete this lock');
  }

  if (Platform.OS === 'ios') {
    try {
      const activityName = `lock_${lockId}`;
      stopMonitoring([activityName]);
      resetBlocks();
    } catch (error) {
      console.error('❌ Failed to clean up Screen Time:', error);
    }
  }

  if (isHolder && lock.status === 'active') {
    await updateDoc(ref, {
      status: 'cancelled',
      cancelledByHolder: true,
      cancelledAt: nowMs(),
      updatedAt: nowMs(),
    });

    try {
      await sendPushNotification(
        lock.creatorUserId,
        'Lock Deleted',
        'Your lock holder has deleted your lock. You are no longer restricted.',
        { type: 'lock_deleted', lockId }
      );
    } catch (error) {
      console.log('Failed to send notification:', error);
    }

    return;
  }

  await updateDoc(ref, {
    status: 'deleted',
    deletedAt: nowMs(),
    updatedAt: nowMs(),
  });
}

export function buildInviteUrl(inviteId: string): string {
  return `timesync://lock/${inviteId}`;
}

// ---------------------------------------------------------------------------
// Unlock Request Functions
// ---------------------------------------------------------------------------

export async function createUnlockRequest(lockId: string, message?: string): Promise<UnlockRequest> {
  const lockRef = doc(db, LOCKS_COLLECTION, lockId);
  const lockSnap = await getDoc(lockRef);

  if (!lockSnap.exists()) throw new Error('Lock not found');
  const lock = { id: lockSnap.id, ...(lockSnap.data() as Lock) };

  if (!lock.holderUserId) throw new Error('Lock has no holder');

  if (!lock.isBlocked) {
    throw new Error('Cannot request unlock - time has not run out yet');
  }

  // Check if there's already a pending request
  const existingQuery = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('lockId', '==', lockId),
    where('status', '==', 'pending')
  );
  const existingSnaps = await getDocs(existingQuery);

  if (!existingSnaps.empty) {
    const existing = existingSnaps.docs[0];
    return { id: existing.id, ...(existing.data() as UnlockRequest) };
  }

  const creatorDoc = await getDoc(doc(db, 'users', lock.creatorUserId));
  const creatorName = formatUserName(creatorDoc.exists() ? creatorDoc.data() as { displayName?: string; email?: string } : null);

  const data = {
    lockId,
    creatorUserId: lock.creatorUserId,
    holderUserId: lock.holderUserId,
    status: 'pending' as const,
    requestedAt: nowMs(),
    message: message || null,
    creatorName,
  };

  const ref = await addDoc(collection(db, UNLOCK_REQUESTS_COLLECTION), data);

  await updateDoc(lockRef, {
    lastUnlockRequestAt: nowMs(),
    updatedAt: nowMs(),
  });

  // Notify the holder on their device via Expo push relay
  try {
    await sendPushNotification(
      lock.holderUserId,
      `🔓 Unlock Request from ${creatorName}`,
      message || `Requesting ${lock.dailyMinutes} more minutes`,
      {
        type: 'unlock_request',
        lockId,
        requestId: ref.id,
        holderUserId: lock.holderUserId,
      }
    );
  } catch (error) {
    console.log('❌ Failed to send notification:', error);
  }

  return { id: ref.id, ...data } as unknown as UnlockRequest;
}

export async function approveUnlockRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, UNLOCK_REQUESTS_COLLECTION, requestId);
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) {
    throw new Error('Unlock request not found');
  }

  const request = requestSnap.data() as UnlockRequest;

  if (request.status !== 'pending') {
    throw new Error('Request already resolved');
  }

  try {
    await updateDoc(requestRef, {
      status: 'approved',
      resolvedAt: nowMs(),
    });
  } catch (updateError) {
    throw new Error(`Failed to update request: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
  }

  if (Platform.OS === 'ios') {
    try {
      const lockRef = doc(db, LOCKS_COLLECTION, request.lockId);

      let lockSnap;
      try {
        lockSnap = await getDoc(lockRef);
      } catch (lockFetchError) {
        throw new Error(`Cannot fetch lock: ${lockFetchError instanceof Error ? lockFetchError.message : String(lockFetchError)}`);
      }

      if (!lockSnap.exists()) {
        throw new Error('Lock not found');
      }

      const lock = { id: lockSnap.id, ...(lockSnap.data() as Lock) };

      await unblockLock(request.lockId);

      const activityName = `lock_${request.lockId}`;
      stopMonitoring([activityName]);

      const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
      if (!selectionToken) throw new Error('No app tokens found');

      await startMonitoring(
        activityName,
        {
          intervalStart: { hour: 0, minute: 0, second: 0 },
          intervalEnd: { hour: 23, minute: 59, second: 59 },
          repeats: true,
        },
        [
          {
            eventName: `${activityName}_threshold`,
            familyActivitySelection: selectionToken,
            threshold: {
              minute: lock.dailyMinutes,
            },
            includesPastActivity: false,
          },
        ]
      );

      // Notify creator their request was approved on their device via Expo push relay
      try {
        const holderDoc = await getDoc(doc(db, 'users', request.holderUserId));
        const holderName = formatUserName(holderDoc.exists() ? holderDoc.data() as { displayName?: string; email?: string } : null, 'Your lock holder');

        await sendPushNotification(
          request.creatorUserId,
          `✅ ${holderName} granted you more time!`,
          `You have ${lock.dailyMinutes} more minutes`,
          {
            type: 'unlock_approved',
            lockId: request.lockId,
            requestId,
            creatorUserId: request.creatorUserId,
          }
        );
      } catch (error) {
        console.log('❌ Failed to send approval notification:', error);
      }
    } catch (error) {
      console.error('Failed to reset Screen Time monitoring:', error);
      throw error;
    }
  }
}

export async function denyUnlockRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, UNLOCK_REQUESTS_COLLECTION, requestId);
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) throw new Error('Unlock request not found');
  const request = requestSnap.data() as UnlockRequest;

  if (request.status !== 'pending') throw new Error('Request already resolved');

  await updateDoc(requestRef, {
    status: 'denied',
    resolvedAt: nowMs(),
  });

  // Notify creator their request was denied on their device via Expo push relay
  try {
    const holderDoc = await getDoc(doc(db, 'users', request.holderUserId));
    const holderName = formatUserName(holderDoc.exists() ? holderDoc.data() as { displayName?: string; email?: string } : null, 'Your lock holder');

    await sendPushNotification(
      request.creatorUserId,
      `❌ ${holderName} denied your request`,
      'Your unlock request was not approved',
      {
        type: 'unlock_denied',
        lockId: request.lockId,
        requestId,
        creatorUserId: request.creatorUserId,
      }
    );
  } catch (error) {
    console.log('❌ Failed to send denial notification:', error);
  }
}

export async function getPendingUnlockRequestsForHolder(holderUserId: string): Promise<UnlockRequest[]> {
  const q = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('holderUserId', '==', holderUserId),
    where('status', '==', 'pending')
  );
  const snaps = await getDocs(q);
  return snaps.docs.map(d => ({ id: d.id, ...(d.data() as UnlockRequest) }));
}

export async function getPendingUnlockRequestForLock(lockId: string): Promise<UnlockRequest | null> {
  const q = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('lockId', '==', lockId),
    where('status', '==', 'pending')
  );
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const d = snaps.docs[0];
  return { id: d.id, ...(d.data() as UnlockRequest) };
}

export function subscribeToUnlockRequests(
  holderUserId: string,
  callback: (requests: UnlockRequest[]) => void
): () => void {
  const q = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('holderUserId', '==', holderUserId),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as UnlockRequest) }));
    callback(requests);
  });
}
