/**
 * Web stub for react-native-device-activity.
 * Device Activity / Screen Time is iOS-only; on web we provide no-op implementations.
 * This file is only used when building for web - native builds use device-activity.ts.
 */

export async function startMonitoring(
  _activityName: string,
  _interval: any,
  _events: any[]
): Promise<void> {
  // no-op
}

export function stopMonitoring(_activityNames: string[]): void {
  // no-op
}

export function blockSelection(_params: any): void {
  // no-op
}

export function resetBlocks(): void {
  // no-op
}

export function updateShield(_config: any, _actions: any): void {
  // no-op
}

export function updateShieldWithId(_config: any, _actions: any, _shieldId: string): void {
  // no-op
}

export function userDefaultsSet(_key: string, _value: any): void {
  // no-op
}

export function setFamilyActivitySelectionId(_params: { id: string; familyActivitySelection: string }): void {
  // no-op
}

export function getActivities(): string[] {
  return [];
}
