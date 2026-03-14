export type ScreenTimeToken = string; // base64 token from FamilyControls

export type LockStatus = 'pending' | 'active' | 'cancelled' | 'deleted';
export type UnlockRequestStatus = 'pending' | 'approved' | 'denied';

export interface Lock {
  id: string;
  appTokens: ScreenTimeToken[]; // apps to which the lock applies
  dailyMinutes: number; // allowed minutes per day
  creatorUserId: string; // user who created/sent the lock
  holderUserId?: string; // user who will be locked (set after acceptance)
  status: LockStatus;
  inviteId?: string; // short code for deep-link invite
  inviteUrl?: string; // deep link or universal link
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  lastUnlockRequestAt?: number; // last time creator requested unlock
  isBlocked?: boolean; // true when apps are currently blocked (time ran out)
  blockedAt?: number; // when apps were blocked
  deletedAt?: number; // when lock was deleted by holder
  cancelledByHolder?: boolean; // true if holder deleted an active lock
  cancelledAt?: number; // when lock was cancelled
}

export interface UnlockRequest {
  id: string;
  lockId: string;
  creatorUserId: string; // the person requesting unlock
  holderUserId: string; // the person who can grant unlock
  status: UnlockRequestStatus;
  requestedAt: number; // epoch ms
  resolvedAt?: number; // when approved/denied
  message?: string | null; // optional message from creator
  creatorName?: string; // display name of the person requesting unlock
}

export interface CreateLockInput {
  appTokens: ScreenTimeToken[];
  dailyMinutes: number;
  creatorUserId: string;
}

export interface InviteLockInput extends CreateLockInput {
  // optional metadata about the intended recipient
  recipientDisplayName?: string;
  recipientPhoneE164?: string; // for iMessage/SMS share
}


