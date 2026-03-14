import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Linking, Platform } from 'react-native';
import { 
  startMonitoring, 
  stopMonitoring, 
  blockSelection,
  resetBlocks,
  updateShield,
  updateShieldWithId,
  userDefaultsSet,
  setFamilyActivitySelectionId
} from 'react-native-device-activity';
import { db } from '../firebase/config';
import { getFamilyActivitySelection } from '../screentime';
import { CreateLockInput, InviteLockInput, Lock, UnlockRequest } from './types';

const LOCKS_COLLECTION = 'locks';
const UNLOCK_REQUESTS_COLLECTION = 'unlockRequests';

function nowMs(): number {
  return Date.now();
}

function generateInviteId(): string {
  return Math.random().toString(36).slice(2, 10);
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
    // Also store server timestamps for server-side ordering if needed
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, LOCKS_COLLECTION), data);
  return { id: ref.id, ...(data as any) } as Lock;
}

export async function createLockInvite(input: InviteLockInput): Promise<Lock> {
  // Currently same as draft; room to add recipient fields
  return createLockDraft(input);
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
  
  console.log(`✅ Accepting lock ${lockId} for recipient ${recipientUserId}`);
  
  // Update Firestore - this will trigger monitoring to start on the creator's device
  await updateDoc(ref, {
    holderUserId: recipientUserId,
    status: 'active',
    updatedAt: nowMs(),
    updatedAtServer: serverTimestamp(),
  });
  
  console.log('✅ Lock accepted - monitoring will start on creator\'s device');
}

// This function is called on the CREATOR's device when their lock becomes active
export async function startMonitoringForCreator(lockId: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    console.log('Screen Time monitoring only available on iOS');
    return;
  }

  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lock not found');
  
  const lock = snap.data() as Lock;
  
  console.log('🎯 LOCKING USER:', {
    lockId,
    creatorUserId: lock.creatorUserId,
    holderUserId: lock.holderUserId,
    dailyMinutes: lock.dailyMinutes,
    status: lock.status
  });
      
  // Check if monitoring is already started for this lock
  const activityName = `lock_${lockId}`;
  const activities = require('react-native-device-activity').getActivities();
  if (activities.includes(activityName)) {
    console.log('⏭️ Monitoring already active for lock:', lockId);
    return;
  }

  try {
    console.log('🚀 Starting Screen Time monitoring on creator\'s device');
    console.log(`⏱️ Time limit: ${lock.dailyMinutes} minute(s)`);
    console.log(`📱 Creator (being locked): ${lock.creatorUserId}`);
    console.log(`🔒 Holder (lock keeper): ${lock.holderUserId}`);
    
    // Use the appTokens from the lock document (set by creator)
    const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
      
      if (!selectionToken) {
      console.error('❌ No app tokens found in lock:', lockId);
      throw new Error('No apps were selected for this lock.');
      }
      
    console.log('✅ App tokens found:', lock.appTokens?.length);
      
      // Start monitoring with daily schedule that resets at midnight
    const eventName = `${activityName}_threshold`;
    
    // Store the family activity selection so the extension can access it
    setFamilyActivitySelectionId({
      id: lockId,
      familyActivitySelection: selectionToken,
    });
    console.log('✅ Stored family activity selection with ID:', lockId);
    
    // Register actions to execute when threshold is reached
    // The extension will automatically block apps when this event fires
    const actionsKey = `actions_for_${activityName}_eventDidReachThreshold_${eventName}`;
    const actions = [
      {
        type: 'blockSelection',
        familyActivitySelectionId: lockId,
        shieldId: lockId, // ⭐ Critical: Links to the shield configuration
      },
    ];
    userDefaultsSet(actionsKey, actions);
    
    console.log('✅ Registered blocking action:');
    console.log(`   Key: ${actionsKey}`);
    console.log(`   Action:`, JSON.stringify(actions, null, 2));
    console.log(`📊 Monitoring configuration:
- Activity Name: ${activityName}
- Event Name: ${eventName}  
- Threshold: ${lock.dailyMinutes} minute(s)
- Apps Selected: ${lock.appTokens?.length || 0}
- Schedule: 00:00 - 23:59 (daily reset)`);
    
    // ⭐⭐⭐ IMPORTANT: Configure shield BEFORE starting monitoring ⭐⭐⭐
    // The shield must be ready when the threshold is hit
    console.log('🛡️ Configuring shield screen BEFORE starting monitoring...');
    
    // IMPORTANT: The Swift extension expects flat keys, not nested objects!
    // AND Swift divides RGB by 255, so we MUST send values in 0-255 range!
    const shieldConfig = {
      backgroundColor: { red: 28, green: 28, blue: 31, alpha: 1 }, // #1C1C1F - Very dark background
      title: '⏱️ Time\'s Up!',
      titleColor: { red: 255, green: 255, blue: 255, alpha: 1 }, // Pure white text - high contrast
      subtitle: `You've used your ${lock.dailyMinutes} minutes for today.`,
      subtitleColor: { red: 230, green: 230, blue: 230, alpha: 1 }, // Off-white text - slightly softer
      primaryButtonLabel: '🔓 Request Unlock',
      primaryButtonLabelColor: { red: 255, green: 255, blue: 255, alpha: 1 }, // Pure white button text
      primaryButtonBackgroundColor: { red: 102, green: 120, blue: 140, alpha: 1 }, // #66788C - Medium blue-grey for better contrast
    };
    
    const shieldActions = {
      primary: {
        type: 'openUrl',
        url: `timesync://request-unlock/${lockId}`,
      },
    };
    
    console.log('🛡️ Shield configuration (flat format for Swift):', JSON.stringify(shieldConfig, null, 2));
    console.log('🛡️ Shield actions:', JSON.stringify(shieldActions, null, 2));
    console.log('🛡️ Shield ID:', lockId);
    console.log('🛡️ Deep link URL:', `timesync://request-unlock/${lockId}`);
    
    // Set both the specific shield ID AND the default shield
    console.log('🛡️ Calling updateShieldWithId...');
    console.log('🛡️ EXACT CONFIG BEING SENT:', {
      backgroundColor: shieldConfig.backgroundColor,
      titleColor: shieldConfig.titleColor,
      subtitleColor: shieldConfig.subtitleColor,
      buttonLabelColor: shieldConfig.primaryButtonLabelColor,
      buttonBgColor: shieldConfig.primaryButtonBackgroundColor
    });
    updateShieldWithId(shieldConfig, shieldActions, lockId);
    console.log('🛡️ Calling updateShield (default)...');
    updateShield(shieldConfig, shieldActions);
    
    console.log('✅ Shield configured with ID:', lockId);
    console.log('✅ Default shield also set');
    console.log('🔍 TO VERIFY: Colors should be WHITE text on DARK background with MEDIUM-GREY button');
    
    console.log(`⏰ TIMER STARTS NOW - App will lock after ${lock.dailyMinutes} minute(s) of use`);
      
      await startMonitoring(
        activityName,
        {
          // Daily schedule from midnight to 11:59 PM
          intervalStart: { hour: 0, minute: 0, second: 0 },
          intervalEnd: { hour: 23, minute: 59, second: 59 },
          repeats: true, // Repeat daily
        },
        [
          {
          eventName,
            familyActivitySelection: selectionToken,
            threshold: {
              minute: lock.dailyMinutes,
            },
            includesPastActivity: false, // Only count usage from now forward
          },
        ]
      );
      
    console.log('✅ startMonitoring() called successfully');
    console.log('✅ Screen Time monitoring activated successfully!');
    console.log(`📱 User being locked: ${lock.creatorUserId}`);
    console.log(`⏱️ Time limit: ${lock.dailyMinutes} minute(s)`);
    console.log(`🔔 Shield will appear when time limit is reached`);
  } catch (error) {
    console.error('Failed to activate Screen Time monitoring on creator\'s device:', error);
    throw error;
  }
}

export async function blockLock(lockId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  
  try {
    const lockRef = doc(db, LOCKS_COLLECTION, lockId);
    const lockSnap = await getDoc(lockRef);
    if (!lockSnap.exists()) throw new Error('Lock not found');
    const lock = { id: lockSnap.id, ...(lockSnap.data() as any) } as Lock;
    
    const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
    if (!selectionToken) throw new Error('No app tokens found');
    
    console.log('Blocking apps for lock:', lockId);
    
    // Block the selected apps
    blockSelection({ familyActivitySelection: selectionToken });
    
    // Try to update Firestore to mark as blocked
    try {
      await updateDoc(lockRef, {
        isBlocked: true,
        blockedAt: nowMs(),
        updatedAt: nowMs(),
        updatedAtServer: serverTimestamp(),
      });
      console.log('✅ Lock marked as blocked in Firestore');
    } catch (firestoreError) {
      console.warn('⚠️ Could not update Firestore (permissions?), but apps are still blocked:', firestoreError);
      // Don't throw - the apps are blocked even if Firestore update fails
    }
    
    console.log('✅ Apps blocked for lock:', lockId);
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
    
    const lock = { id: lockSnap.id, ...(lockSnap.data() as any) } as Lock;
    
    const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
    if (!selectionToken) {
      console.warn('No app tokens found, clearing all blocks');
      resetBlocks();
      return;
    }
    
    console.log('Unblocking apps for lock:', lockId);
    
    // Reset blocks (removes all blocking)
    resetBlocks();
    console.log('✅ Screen Time blocks cleared');
    
    // Try to update Firestore to mark as unblocked
    try {
      await updateDoc(lockRef, {
        isBlocked: false,
        blockedAt: null,
        updatedAt: nowMs(),
        updatedAtServer: serverTimestamp(),
      });
      console.log('✅ Lock marked as unblocked in Firestore');
    } catch (firestoreError) {
      console.warn('⚠️ Could not update Firestore (permissions?), but apps are unblocked:', firestoreError);
      // Don't throw - the apps are unblocked even if Firestore update fails
    }
    
    console.log('✅ Apps unblocked for lock:', lockId);
  } catch (error) {
    console.error('Failed to unblock apps:', error);
    // Still try to clear blocks even if there's an error
    try {
      resetBlocks();
      console.log('✅ Blocks cleared despite error');
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
  return { id: snap.id, ...(snap.data() as any) } as Lock;
}

export async function getLockByInviteId(inviteId: string): Promise<Lock | null> {
  const q = query(collection(db, LOCKS_COLLECTION), where('inviteId', '==', inviteId));
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const lockDoc = snaps.docs[0];
  return { id: lockDoc.id, ...(lockDoc.data() as any) } as Lock;
}

export async function listLocksForCreator(userId: string): Promise<Lock[]> {
  const q = query(collection(db, LOCKS_COLLECTION), where('creatorUserId', '==', userId));
  const snaps = await getDocs(q);
  // Filter out deleted locks for creators too
  return snaps.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as Lock))
    .filter(lock => lock.status !== 'deleted');
}

export async function listLocksForHolder(userId: string): Promise<Lock[]> {
  const q = query(collection(db, LOCKS_COLLECTION), where('holderUserId', '==', userId));
  const snaps = await getDocs(q);
  // Filter out deleted locks for holders
  return snaps.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as Lock))
    .filter(lock => lock.status !== 'deleted');
}

export async function listPendingLocksForUser(userId: string): Promise<Lock[]> {
  // Get locks where status is pending and the user is not the creator
  // This finds locks that have been sent to this user but not yet accepted
  const q = query(
    collection(db, LOCKS_COLLECTION),
    where('status', '==', 'pending')
  );
  const snaps = await getDocs(q);
  // Filter out locks created by this user (they're "sent" locks, not "pending" for acceptance)
  return snaps.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as Lock))
    .filter(lock => lock.creatorUserId !== userId);
}

export async function cancelLock(lockId: string): Promise<void> {
  const ref = doc(db, LOCKS_COLLECTION, lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lock not found');
  
  const lock = snap.data() as Lock;
  
  // Update Firestore
  await updateDoc(ref, {
    status: 'cancelled',
    updatedAt: nowMs(),
    updatedAtServer: serverTimestamp(),
  });
  
  // Clean up Screen Time monitoring and restrictions (iOS only)
  if (Platform.OS === 'ios') {
    try {
      console.log('🧹 Cleaning up Screen Time for cancelled lock:', lockId);
      
      // 1. Stop monitoring
      const activityName = `lock_${lockId}`;
      stopMonitoring([activityName]);
      console.log('✅ Monitoring stopped');
      
      // 2. Remove all blocks
      resetBlocks();
      console.log('✅ All blocks cleared');
      
      // 3. Update Firestore to mark as unblocked
      if (lock.isBlocked) {
        await updateDoc(ref, {
          isBlocked: false,
          blockedAt: null,
        });
        console.log('✅ Lock marked as unblocked in Firestore');
      }
      
      console.log('✅ Screen Time fully cleaned up for lock:', lockId);
    } catch (error) {
      console.error('❌ Failed to clean up Screen Time:', error);
      // Don't throw - the lock is already cancelled in Firestore
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
  
  // Allow deletion if:
  // 1. User is the holder (can delete active or cancelled locks), OR
  // 2. User is the creator AND lock is cancelled
  const isHolder = lock.holderUserId === userId;
  const isCreatorOfCancelledLock = lock.creatorUserId === userId && lock.status === 'cancelled';
  
  if (!isHolder && !isCreatorOfCancelledLock) {
    throw new Error('You cannot delete this lock');
  }
  
  // Clean up Screen Time restrictions for ANY lock deletion (iOS only)
  if (Platform.OS === 'ios') {
    try {
      console.log('🧹 Cleaning up Screen Time for deleted lock:', lockId);
      
      // 1. Stop monitoring
      const activityName = `lock_${lockId}`;
      stopMonitoring([activityName]);
      console.log('✅ Monitoring stopped');
      
      // 2. Remove all blocks (this clears the shield too)
      resetBlocks();
      console.log('✅ All blocks and shields cleared');
      
      console.log('✅ Screen Time fully cleaned up');
    } catch (error) {
      console.error('❌ Failed to clean up Screen Time:', error);
      // Continue with deletion even if cleanup fails
    }
  }
  
  // If holder is deleting an active lock, cancel it instead and notify creator
  if (isHolder && lock.status === 'active') {
    console.log('Holder deleting active lock - cancelling and notifying creator');
    
    // Update lock status to cancelled
    await updateDoc(ref, {
      status: 'cancelled',
      cancelledByHolder: true,
      cancelledAt: nowMs(),
      updatedAt: nowMs(),
      updatedAtServer: serverTimestamp(),
    });
    
    // Send notification to creator
    try {
      const { sendPushNotification } = await import('../notifications');
      await sendPushNotification(
        lock.creatorUserId,
        'Lock Deleted',
        'Your lock holder has deleted your lock. You are no longer restricted.',
        { type: 'lock_deleted', lockId }
      );
      console.log('Notification sent to creator');
    } catch (error) {
      console.error('Failed to send notification:', error);
      // Don't throw - lock is already cancelled
    }
    
    console.log('Active lock cancelled by holder:', lockId);
    return;
  }
  
  // For cancelled locks, mark as deleted (soft delete for UI cleanup)
  await updateDoc(ref, {
    status: 'deleted',
    deletedAt: nowMs(),
    updatedAt: nowMs(),
    updatedAtServer: serverTimestamp(),
  });
  
  console.log('Cancelled lock deleted by user:', userId);
}

export function buildInviteUrl(inviteId: string): string {
  return `timesync://lock/${inviteId}`;
}

// Unlock Request Functions

export async function createUnlockRequest(lockId: string, message?: string): Promise<UnlockRequest> {
  const lockRef = doc(db, LOCKS_COLLECTION, lockId);
  const lockSnap = await getDoc(lockRef);
  
  if (!lockSnap.exists()) throw new Error('Lock not found');
  const lock = { id: lockSnap.id, ...(lockSnap.data() as any) } as Lock;
  
  if (!lock.holderUserId) throw new Error('Lock has no holder');
  
  // Only allow unlock requests when apps are blocked (time has run out)
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
    // Return existing pending request
    const existing = existingSnaps.docs[0];
    return { id: existing.id, ...(existing.data() as any) } as UnlockRequest;
  }
  
  // Get creator's name for notification and UI display
  const creatorDoc = await getDoc(doc(db, 'users', lock.creatorUserId));
  let creatorName = 'Someone';
  
  if (creatorDoc.exists()) {
    const userData = creatorDoc.data();
    // Try display name first, then email, then default
    creatorName = userData.displayName || userData.email || 'Someone';
    
    // If it's an email, extract just the name part (before @)
    if (creatorName.includes('@')) {
      const emailName = creatorName.split('@')[0];
      // Capitalize first letter and replace dots/underscores with spaces
      creatorName = emailName
        .replace(/[._]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  console.log('📝 Creator name for unlock request:', creatorName);
  
  // Create new unlock request
  const data = {
    lockId,
    creatorUserId: lock.creatorUserId,
    holderUserId: lock.holderUserId,
    status: 'pending' as const,
    requestedAt: nowMs(),
    message: message || null, // Use null instead of undefined for Firestore
    creatorName, // Add creator name for UI display
    createdAtServer: serverTimestamp(),
  };
  
  const ref = await addDoc(collection(db, UNLOCK_REQUESTS_COLLECTION), data);
  
  // Update lock with last request time
  await updateDoc(lockRef, {
    lastUnlockRequestAt: nowMs(),
    updatedAt: nowMs(),
    updatedAtServer: serverTimestamp(),
  });
  
  console.log('📤 Unlock request created, sending notification to holder...');
  
  // Send notification to the holder
  // Note: In production, this would be handled by a backend (Firebase Cloud Functions)
  // For now, we'll use local notification API which will show on the holder's device when they open the app
  try {
    const { sendLocalNotification } = await import('../notifications');
    await sendLocalNotification(
      `🔓 Unlock Request from ${creatorName}`,
      message || `Requesting ${lock.dailyMinutes} more minutes`,
      { 
        type: 'unlock_request', 
        lockId, 
        requestId: ref.id,
        holderUserId: lock.holderUserId
      }
    );
    console.log('✅ Notification sent to holder');
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    // Don't throw - request was still created successfully
  }
  
  return { id: ref.id, ...(data as any) } as UnlockRequest;
}

export async function approveUnlockRequest(requestId: string): Promise<void> {
  console.log('🔓 Starting approveUnlockRequest for:', requestId);
  
  const requestRef = doc(db, UNLOCK_REQUESTS_COLLECTION, requestId);
  
  console.log('📖 Fetching unlock request...');
  const requestSnap = await getDoc(requestRef);
  
  if (!requestSnap.exists()) {
    console.error('❌ Unlock request not found:', requestId);
    throw new Error('Unlock request not found');
  }
  
  const request = requestSnap.data() as UnlockRequest;
  console.log('✅ Request found:', { 
    status: request.status, 
    creatorUserId: request.creatorUserId,
    holderUserId: request.holderUserId,
    lockId: request.lockId
  });
  
  if (request.status !== 'pending') {
    console.error('❌ Request already resolved:', request.status);
    throw new Error('Request already resolved');
  }
  
  // Update request status
  console.log('📝 Updating request status to approved...');
  try {
    await updateDoc(requestRef, {
      status: 'approved',
      resolvedAt: nowMs(),
      updatedAtServer: serverTimestamp(),
    });
    console.log('✅ Request status updated successfully');
  } catch (updateError) {
    console.error('❌ FAILED to update request status:', updateError);
    throw new Error(`Failed to update request: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
  }
  
  // Reset the monitoring to give more time (iOS only)
  if (Platform.OS === 'ios') {
    try {
      console.log('🔄 Resetting Screen Time monitoring for lock:', request.lockId);
      
      // Get lock details
      console.log('📖 Fetching lock document...');
      const lockRef = doc(db, LOCKS_COLLECTION, request.lockId);
      
      let lockSnap;
      try {
        lockSnap = await getDoc(lockRef);
        console.log('✅ Lock document fetched, exists:', lockSnap.exists());
      } catch (lockFetchError) {
        console.error('❌ FAILED to fetch lock document:', lockFetchError);
        console.error('Lock ID:', request.lockId);
        console.error('Request creator:', request.creatorUserId);
        console.error('Request holder:', request.holderUserId);
        throw new Error(`Cannot fetch lock: ${lockFetchError instanceof Error ? lockFetchError.message : String(lockFetchError)}`);
      }
      
      if (!lockSnap.exists()) {
        console.error('❌ Lock document does not exist:', request.lockId);
        throw new Error('Lock not found');
      }
      
      const lock = { id: lockSnap.id, ...(lockSnap.data() as any) } as Lock;
      console.log('✅ Lock data:', {
        id: lock.id,
        creatorUserId: lock.creatorUserId,
        holderUserId: lock.holderUserId,
        status: lock.status,
        isBlocked: lock.isBlocked
      });
      
      // Unblock apps first
      await unblockLock(request.lockId);
      
      // Stop current monitoring
      const activityName = `lock_${request.lockId}`;
      stopMonitoring([activityName]);
      
      // Get selection token
      const selectionToken = lock.appTokens && lock.appTokens.length > 0 ? lock.appTokens[0] : null;
      if (!selectionToken) throw new Error('No app tokens found');
      
      // Restart monitoring with same schedule (this resets the timer)
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
      
      console.log('✅ Apps unblocked and timer restarted');
      
      // Send notification to creator that their request was approved
      try {
        const holderDoc = await getDoc(doc(db, 'users', request.holderUserId));
        let holderName = 'Your lock holder';
        
        if (holderDoc.exists()) {
          const userData = holderDoc.data();
          holderName = userData.displayName || userData.email || 'Your lock holder';
          
          // If it's an email, extract just the name part
          if (holderName.includes('@')) {
            const emailName = holderName.split('@')[0];
            holderName = emailName
              .replace(/[._]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          }
        }
        
        const { sendLocalNotification } = await import('../notifications');
        await sendLocalNotification(
          `✅ ${holderName} granted you more time!`,
          `You have ${lock.dailyMinutes} more minutes`,
          { 
            type: 'unlock_approved', 
            lockId: request.lockId, 
            requestId,
            creatorUserId: request.creatorUserId
          }
        );
        console.log('✅ Approval notification sent to creator');
      } catch (error) {
        console.error('❌ Failed to send approval notification:', error);
        // Don't throw - approval was successful
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
  
  // Update request status
  await updateDoc(requestRef, {
    status: 'denied',
    resolvedAt: nowMs(),
    updatedAtServer: serverTimestamp(),
  });
  
  // Send notification to creator that their request was denied
  try {
    const holderDoc = await getDoc(doc(db, 'users', request.holderUserId));
    let holderName = 'Your lock holder';
    
    if (holderDoc.exists()) {
      const userData = holderDoc.data();
      holderName = userData.displayName || userData.email || 'Your lock holder';
      
      // If it's an email, extract just the name part
      if (holderName.includes('@')) {
        const emailName = holderName.split('@')[0];
        holderName = emailName
          .replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    
    const { sendLocalNotification } = await import('../notifications');
    await sendLocalNotification(
      `❌ ${holderName} denied your request`,
      'Your unlock request was not approved',
      { 
        type: 'unlock_denied', 
        lockId: request.lockId, 
        requestId,
        creatorUserId: request.creatorUserId
      }
    );
    console.log('✅ Denial notification sent to creator');
  } catch (error) {
    console.error('❌ Failed to send denial notification:', error);
    // Don't throw - denial was successful
  }
}

export async function getPendingUnlockRequestsForHolder(holderUserId: string): Promise<UnlockRequest[]> {
  const q = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('holderUserId', '==', holderUserId),
    where('status', '==', 'pending')
  );
  const snaps = await getDocs(q);
  return snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) } as UnlockRequest));
}

export async function getPendingUnlockRequestForLock(lockId: string): Promise<UnlockRequest | null> {
  const q = query(
    collection(db, UNLOCK_REQUESTS_COLLECTION),
    where('lockId', '==', lockId),
    where('status', '==', 'pending')
  );
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const doc = snaps.docs[0];
  return { id: doc.id, ...(doc.data() as any) } as UnlockRequest;
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
    const requests = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as UnlockRequest));
    callback(requests);
  });
}


