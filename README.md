# TimeSync

TimeSync is an iOS app that lets one person (the **creator**) place a daily Screen Time limit on specific apps for another person (the **holder**). When the holder's time runs out iOS shields the restricted apps; the holder can request an unlock which the creator approves or denies in real time.

---

## How it works

### Creator flow
1. Open TimeSync and tap **Create Lock** on the Home tab.
2. Select which apps to restrict and choose a daily time limit (in minutes).
3. Share the generated deep-link (`timesync://lock/{inviteId}`) with the holder.

### Holder flow
1. Open the deep-link on the holder's device.
2. Accept the lock invite — Screen Time monitoring starts immediately on the **creator's** device.
3. When the daily limit is reached, iOS shows a shield screen over the restricted apps.

### Unlock request flow
1. Holder taps **Request Unlock** on the shield screen (or from the Locks tab).
2. A push notification is sent to the creator.
3. Creator approves or denies inside TimeSync — if approved, the shield is removed and the timer resets.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo (SDK 54) |
| Routing | Expo Router v6 (file-based) |
| Screen Time | `react-native-device-activity` + Apple Family Controls |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Notifications | Expo Notifications (local + push token ready) |
| Language | TypeScript |

---

## Architecture

```
app/
  _layout.tsx                Root layout — AuthProvider, DeepLinkProvider
  (tabs)/
    _layout.tsx              Tab navigator — lock listeners, badge count
    index.tsx                Home/dashboard screen
    your_locks.tsx           Locks list screen
    profile.tsx              Profile & settings screen
  signin.tsx
  signup.tsx
  select_apps.tsx            Create lock — app picker, limit stepper, share
  lock/
    [inviteId].tsx           Accept invite screen
  request-unlock/
    [lockId].tsx             Holder unlock-request screen

lib/
  firebase/
    config.ts                Firebase init (project: lock-it-a3dee — do not rename)
    AuthContext.tsx
    auth.ts
    firestore.ts
  locks/
    service.ts               All Firestore + Screen Time business logic
    DeepLinkProvider.tsx     timesync:// URL parsing and pending-invite state
    types.ts
    utils.ts                 formatUserName helper
  screentime.ts              react-native-device-activity wrappers
  notifications.ts           Expo push token registration + local notifications

components/
  ui/
    Button.tsx               Variants: primary, secondary, danger, ghost; sizes sm/md/lg
    StatusBadge.tsx          Colored pill: pending/active/blocked/cancelled
    LockCard.tsx             Reusable lock card with status + action buttons
  feature/
    UnlockRequestsList.tsx   Real-time pending unlock requests for holders

constants/
  theme.ts                   Colors, Radius, Spacing — single source of truth

targets/                     Native Apple extensions
  ActivityMonitorExtension/  Fires when usage threshold is reached
  ShieldAction/              Handles "Request Unlock" tap on shield
  ShieldConfiguration/       Configures shield appearance

plugins/
  with-screen-time-entitlements  Expo config plugin for Family Controls entitlement
```

### Frontend architecture

**Tab structure:**

| Tab | Screen | Purpose |
|-----|--------|---------|
| Home | `(tabs)/index.tsx` | Dashboard: stats, active lock summary, Create Lock |
| Locks | `(tabs)/your_locks.tsx` | Sent/held locks, pending invites, unlock requests |
| Profile | `(tabs)/profile.tsx` | Account info, Screen Time status, sign out |

**Shared components:**

| Component | Props | Purpose |
|-----------|-------|---------|
| `Button` | `variant`, `size`, `leftIcon` | All CTA buttons |
| `StatusBadge` | `status` | Lock state pill |
| `LockCard` | `lock`, `role`, action callbacks | Full lock card with actions |

**Design system:** All colours, radii, and spacing are imported from `constants/theme.ts`. Never hard-code hex values in component files.

---

### Firestore data model

**`locks/{lockId}`**
```
creatorUserId:  string
holderUserId:   string | null
status:         'pending' | 'active' | 'cancelled' | 'deleted'
inviteId:       string
inviteUrl:      string          // timesync://lock/{inviteId}
appTokens:      string[]        // FamilyActivitySelection tokens
dailyMinutes:   number
isBlocked:      boolean
createdAt:      number (ms)
updatedAt:      number (ms)
```

**`unlockRequests/{requestId}`**
```
lockId:         string
creatorUserId:  string
holderUserId:   string
status:         'pending' | 'approved' | 'denied'
requestedAt:    number (ms)
resolvedAt:     number (ms) | null
message:        string | null
creatorName:    string
```

**`pushTokens/{uid}`** *(written by `lib/notifications.ts` on login)*
```
token:      string   // Expo push token
updatedAt:  number (ms)
```

---

## Setup

### Prerequisites
- macOS with Xcode 15+
- Apple Developer account enrolled in the **Family Controls** capability (requires approval from Apple)
- A physical iOS device (Screen Time APIs do not work on the simulator)

### 1. Clone and install
```bash
git clone <repo>
cd TimeSync
npm install
```

### 2. Configure Firebase
Copy your Firebase project credentials into `lib/firebase/config.ts`. The current file references the project `lock-it-a3dee` — this is an external Firebase resource and **must not be renamed** even though the rest of the codebase uses the TimeSync name.

### 3. Apple Developer setup
- Enable the **Family Controls** entitlement in your Apple Developer portal (requires explicit approval from Apple).
- The App Group identifier used by all extensions is `group.com.hanny283.timesync`. Update `app.json` and all `targets/*/generated.entitlements` if you change your bundle ID.

### 4. Build and run
```bash
npx expo run:ios --device
```

> **Note:** `expo start` / Expo Go will not work because Screen Time APIs require a development build with the Family Controls entitlement.

---

## Screen Time API limitations

- `react-native-device-activity` fires monitoring events but provides **no usage query API** — the dashboard cannot show "X minutes used today", only `isBlocked` (set by Firestore when the threshold event fires).
- All monitoring runs on the **creator's** device — this is intentional. The creator sets the limit; the creator's device enforces it via Device Activity Monitor.
- Restrictions reset automatically when the monitoring activity is re-started after midnight. The Firestore `isBlocked` flag needs a Cloud Function (`dailyMidnightReset`) to reset at UTC midnight, otherwise the UI will still show BLOCKED even after the native shield lifts.
- App tokens (`FamilyActivitySelection`) are opaque strings — they cannot be decoded back into app names without native code.

---

## Notification architecture

**Current state:** `lib/notifications.ts` registers an Expo push token and writes it to `pushTokens/{uid}` in Firestore. The `sendPushNotification()` helper fetches the recipient's token and POSTs to Expo's push relay (`exp.host/--/api/v2/push/send`). This works for peer-to-peer notifications **as long as both users have the app open at least once after login**.

**Production gap:** Calling `sendPushNotification()` from the client exposes Firestore tokens to the calling user. The correct architecture is to trigger sends from a Firebase Cloud Function so tokens are never sent to another user's device.

**Required Cloud Functions:** See `docs/backend-prompt.md`.

---

## Firestore security rules (required)

The project currently has **no Firestore security rules** in source control. Before going to production, the following rules must be deployed:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Locks — readable/writable only by creator or holder
    match /locks/{lockId} {
      allow read: if request.auth.uid == resource.data.creatorUserId
                  || request.auth.uid == resource.data.holderUserId;
      allow create: if request.auth.uid == request.resource.data.creatorUserId;
      allow update: if request.auth.uid == resource.data.creatorUserId
                    || request.auth.uid == resource.data.holderUserId;
      allow delete: if false;
    }

    // Unlock requests — readable/writable only by parties on the parent lock
    match /unlockRequests/{requestId} {
      allow read, write: if request.auth.uid == resource.data.creatorUserId
                         || request.auth.uid == resource.data.holderUserId;
      allow create: if request.auth.uid == request.resource.data.creatorUserId;
    }

    // Push tokens — each user can only read/write their own
    match /pushTokens/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

---

## Known limitations

| Limitation | Notes |
|-----------|-------|
| iOS only | `react-native-device-activity` and Family Controls are Apple-only APIs |
| Physical device required | Screen Time monitoring and app blocking cannot be tested on the iOS Simulator |
| Push notifications | Client-side token reads expose tokens; move sends to Cloud Functions (see `docs/backend-prompt.md`) |
| No midnight Firestore reset | `isBlocked` stays `true` until a Cloud Function resets it at UTC midnight |
| Firebase project name | The Firebase project is still named `lock-it-a3dee` — renaming requires migrating the live Firestore database |
| No `users/{uid}` document | Auth creates the Firebase Auth user but never writes a Firestore user document; FCM token is stored separately in `pushTokens/{uid}` |
