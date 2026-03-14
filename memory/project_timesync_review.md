---
name: BuddyBump UI Overhaul
description: Full UI overhaul completed 2026-03-14 — dark theme, new components, profile tab, README, backend prompt
type: project
---

Full UI overhaul implemented across all screens on 2026-03-14.

**Why:** App was functional but visually inconsistent — light auth screens, no tab icons, bare stat cards.

**What was done:**
- `constants/theme.ts` — replaced with Colors/Radius/Spacing design tokens
- `components/ui/Button.tsx` — added danger/ghost variants, size prop (sm/md/lg), leftIcon
- `components/ui/StatusBadge.tsx` — new; colored pill for lock status
- `components/ui/LockCard.tsx` — new; reusable card extracted from your_locks
- `app/signin.tsx` + `app/signup.tsx` — dark theme, logo section (lock icon + BUDDYBUMP label), removed "Go Back" link
- `app/(tabs)/profile.tsx` — new screen with avatar, Screen Time status chip, sign out
- `app/(tabs)/_layout.tsx` — Ionicons tab icons, 3-tab layout (Home/Locks/Profile), iOS height fix, badge on Locks tab for pending unlock requests
- `app/(tabs)/index.tsx` — greeting header, avatar button to Profile, stats with icons/accent borders, active lock summary, info tip card, removed sign-out button
- `components/feature/UnlockRequestsList.tsx` — Ionicons instead of emoji, danger variant for Deny button, thinner left-border style
- `app/(tabs)/your_locks.tsx` — LockCard + SectionHeader components, empty states with icons
- `app/select_apps.tsx` — step indicator pills, +/- stepper, quick presets, chevron back button
- `app/lock/[inviteId].tsx` — icon box replacing emoji, info rows (reset time, apps count)
- `app/request-unlock/[lockId].tsx` — Ionicons replacing emojis, fixed placeholder color
- `README.md` — fixed file paths, added Frontend Architecture, Screen Time API limitations, notification architecture, Firestore rules
- `docs/backend-prompt.md` — new; complete backend brief with 5 Cloud Functions, security rules, missing user doc write

**How to apply:** The design system lives in `constants/theme.ts`. All new components follow the established patterns. The backend doc is at `docs/backend-prompt.md`.
