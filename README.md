# TimeSync

TimeSync is an iOS app that lets one person (the **creator**) place a daily Screen Time limit on specific apps for another person (the **holder**). When the holder's time runs out iOS shields the restricted apps; the holder can request an unlock which the creator approves or denies in real time.

---

## How it works

### Creator flow
1. Open TimeSync and tap **Create Lock**.
2. *(Coming soon)* Select which apps to restrict and choose a daily time limit (in minutes).
3. Share the generated deep-link (`timesync://lock/{inviteId}`) with the holder.

### Holder flow
1. Open the deep-link on the holder's device.
2. Accept the lock invite — Screen Time monitoring starts immediately on the **creator's** device.
3. When the daily limit is reached, iOS shows a shield screen over the restricted apps.

### Unlock request flow
1. Holder taps **Request Unlock** on the shield screen.
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
| Notifications | Expo Notifications (local) |
| Language | TypeScript |

---

## Architecture

```
app/
  _layout.tsx          Root layout — AuthProvider, DeepLinkProvider, ErrorBoundary
  (tabs)/
    index.tsx          Home/dashboard screen
    locks.tsx          Locks list screen
  signin.tsx
  signup.tsx
  lock-invite.tsx      Accept invite screen
  request-unlock.tsx   Holder unlock-request screen

lib/
  firebase/
    config.ts          Firebase init (project: lock-it-a3dee — external resource, do not rename)
    AuthContext.tsx
    auth.ts
  locks/
    service.ts         All Firestore + Screen Time business logic
    DeepLinkProvider.tsx  timesync:// URL parsing and pending-invite state
    types.ts
  screentime/          react-native-device-activity wrappers
  notifications/

components/
  ErrorBoundary.tsx
  ui 2/                Shared UI components (Button, etc.)

targets/               Native Apple extensions
  ActivityMonitorExtension/   Fires when usage threshold is reached
  ShieldAction/               Handles "Request Unlock" tap on the shield
  ShieldConfiguration/        Configures shield appearance

plugins/
  with-screen-time-entitlements  Expo config plugin for Family Controls entitlement
```

### Firestore data model

**`locks/{lockId}`**
```
creatorUserId: string
holderUserId:  string | null
status:        'pending' | 'active' | 'cancelled' | 'deleted'
inviteId:      string
inviteUrl:     string          // timesync://lock/{inviteId}
appTokens:     string[]        // FamilyActivitySelection tokens
dailyMinutes:  number
isBlocked:     boolean
createdAt:     number (ms)
updatedAt:     number (ms)
```

**`unlockRequests/{requestId}`**
```
lockId:        string
creatorUserId: string
holderUserId:  string
status:        'pending' | 'approved' | 'denied'
requestedAt:   number (ms)
resolvedAt:    number (ms) | null
message:       string | null
creatorName:   string
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
cd BuddyBump
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

## Known limitations

| Limitation | Notes |
|-----------|-------|
| iOS only | `react-native-device-activity` and Family Controls are Apple-only APIs |
| `/select_apps` screen missing | The "Create Lock" button shows a "Coming soon" alert; the screen needs a `DeviceActivitySelectionView` for app picking and a minutes input, then calls `createLockInvite()` and shares the invite URL |
| Firebase project name | The Firebase project is still named `lock-it-a3dee` — renaming it requires migrating the live Firestore database |
| Physical device required | Screen Time monitoring and app blocking cannot be tested on the iOS Simulator |
| Push notifications | Unlock request notifications are local-only; cross-device notifications require Firebase Cloud Functions |
