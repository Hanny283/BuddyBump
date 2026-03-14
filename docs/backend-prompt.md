# TimeSync — Backend Engineer Prompt

## Context

TimeSync is a React Native (Expo) iOS app that lets users place Screen Time limits on each other as accountability buddies. The frontend is complete. You are being brought in to harden the backend: write Firestore security rules, set up Cloud Functions for push notifications and a nightly reset, and add a few missing Firestore writes.

**Firebase project:** `lock-it-a3dee` (Firestore + Firebase Auth already in use — do not rename)
**Notifications:** Expo Push Notification service (`exp.host/--/api/v2/push/send`)
**Frontend repo:** see `README.md` for architecture overview

---

## 1. Firestore Security Rules

The project currently has **no rules in source control**. Deploy the following (or stricter) rules before any public release.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /locks/{lockId} {
      allow read: if request.auth != null
                  && (request.auth.uid == resource.data.creatorUserId
                      || request.auth.uid == resource.data.holderUserId);
      allow create: if request.auth != null
                    && request.auth.uid == request.resource.data.creatorUserId;
      allow update: if request.auth != null
                    && (request.auth.uid == resource.data.creatorUserId
                        || request.auth.uid == resource.data.holderUserId);
      allow delete: if false;
    }

    match /unlockRequests/{requestId} {
      allow read: if request.auth != null
                  && (request.auth.uid == resource.data.creatorUserId
                      || request.auth.uid == resource.data.holderUserId);
      allow create: if request.auth != null
                    && request.auth.uid == request.resource.data.creatorUserId;
      allow update: if request.auth != null
                    && request.auth.uid == resource.data.holderUserId; // only holder resolves
      allow delete: if false;
    }

    // Push tokens — each user reads/writes only their own
    match /pushTokens/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // User documents (to be created — see section 4)
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## 2. Cloud Functions

### Helper: `getExpoPushToken(uid)`

```typescript
async function getExpoPushToken(uid: string): Promise<string | null> {
  const snap = await admin.firestore().collection('pushTokens').doc(uid).get();
  return snap.exists ? (snap.data() as any).token : null;
}

async function sendExpoPush(token: string, title: string, body: string, data?: object) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, data }),
  });
}
```

---

### Function 1: `onUnlockRequestCreated`

**Trigger:** `onDocumentCreated('unlockRequests/{requestId}')`

**What it does:** When a creator submits an unlock request, notify the **holder**.

```typescript
export const onUnlockRequestCreated = onDocumentCreated(
  'unlockRequests/{requestId}',
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== 'pending') return;

    const token = await getExpoPushToken(request.holderUserId);
    if (!token) return;

    const creatorName = request.creatorName || 'Someone';
    await sendExpoPush(
      token,
      '🔓 Unlock Request',
      `${creatorName} is asking for more time.`,
      { lockId: request.lockId, requestId: event.params.requestId }
    );
  }
);
```

---

### Function 2: `onUnlockRequestResolved`

**Trigger:** `onDocumentUpdated('unlockRequests/{requestId}')`

**What it does:** When a holder approves or denies a request, notify the **creator**.

```typescript
export const onUnlockRequestResolved = onDocumentUpdated(
  'unlockRequests/{requestId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status !== 'pending' || after.status === 'pending') return;

    const token = await getExpoPushToken(after.creatorUserId);
    if (!token) return;

    const approved = after.status === 'approved';
    await sendExpoPush(
      token,
      approved ? '✅ Unlock Approved' : '❌ Unlock Denied',
      approved
        ? 'Your lock holder approved the request. Timer has reset.'
        : 'Your lock holder denied the request.',
      { lockId: after.lockId }
    );
  }
);
```

---

### Function 3: `onLockAccepted`

**Trigger:** `onDocumentUpdated('locks/{lockId}')`

**What it does:** When a lock transitions `pending → active` (holder accepted), notify the **creator**.

```typescript
export const onLockAccepted = onDocumentUpdated(
  'locks/{lockId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status !== 'pending' || after.status !== 'active') return;

    const token = await getExpoPushToken(after.creatorUserId);
    if (!token) return;

    await sendExpoPush(
      token,
      '🔒 Lock Accepted',
      'Your accountability buddy accepted your lock. Monitoring is now active.',
      { lockId: event.params.lockId }
    );
  }
);
```

---

### Function 4: `onLockCancelledByHolder`

**Trigger:** `onDocumentUpdated('locks/{lockId}')`

**What it does:** When a holder cancels an active lock (`cancelledByHolder: true`), notify the **creator**.

This can be combined with Function 3 in a single `onDocumentUpdated` handler to avoid double-deploys.

```typescript
// Inside the same onDocumentUpdated handler as Function 3:
if (before.status === 'active' && after.status === 'cancelled' && after.cancelledByHolder) {
  const token = await getExpoPushToken(after.creatorUserId);
  if (token) {
    await sendExpoPush(
      token,
      '🔓 Lock Cancelled',
      'Your accountability buddy cancelled the lock.',
      { lockId: event.params.lockId }
    );
  }
}
```

---

### Function 5: `dailyMidnightReset` (scheduled)

**Trigger:** `onSchedule('0 0 * * *')` (UTC midnight every day)

**What it does:** Resets `isBlocked: false` on all active locks so the UI doesn't permanently show BLOCKED after the native Screen Time shield lifts.

```typescript
export const dailyMidnightReset = onSchedule('0 0 * * *', async () => {
  const db = admin.firestore();
  const snapshot = await db
    .collection('locks')
    .where('status', '==', 'active')
    .where('isBlocked', '==', true)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isBlocked: false,
      blockedAt: admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
  });

  await batch.commit();
  console.log(`Reset ${snapshot.size} blocked lock(s)`);
});
```

---

## 3. Missing Firestore Write: `users/{uid}`

`lib/firebase/auth.ts` never creates a Firestore user document. Add this after `createUserWithEmailAndPassword` in the `signUp` function:

```typescript
// After creating the user:
await setDoc(doc(db, 'users', userCredential.user.uid), {
  email: userCredential.user.email,
  displayName: null,
  createdAt: Date.now(),
});
```

This enables the security rule for `users/{uid}` and gives the Cloud Functions a place to look up display names without depending on `creatorName` being denormalized into every `unlockRequest`.

---

## 4. Data Model Additions

### `users/{uid}`
```
email:        string
displayName:  string | null
createdAt:    number (ms)
```

### `locks/{lockId}` — optional addition
Consider writing `creatorDisplayName` (from `formatUserName(user)`) at lock creation time. This avoids per-lock user fetches in the UI and works even if the `users/{uid}` document is missing.

---

## 5. Deployment checklist

- [ ] Deploy Firestore security rules
- [ ] Deploy all 5 Cloud Functions (can combine Functions 3+4 into one)
- [ ] Add `users/{uid}` write to `signUp` in `lib/firebase/auth.ts`
- [ ] Verify `pushTokens/{uid}` is written on every app login (currently done in `_layout.tsx` via `registerForPushNotifications`)
- [ ] Enable Cloud Scheduler API in GCP console (required for `dailyMidnightReset`)
- [ ] Test end-to-end: create lock → accept → run out of time → request unlock → approve → verify `isBlocked` resets at midnight
