/**
 * Web stub for Screen Time / Family Controls.
 * Screen Time is iOS-only; on web we provide no-op implementations for demo purposes.
 * This file is only used when building for web - native builds use screentime.ts.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Selection = {
  applications: string[];
  categories: string[];
};

export function getAuthorizationStatus(): number {
  return 1; // denied - not available on web
}

export function isFamilyControlsAuthorized(): boolean {
  return false;
}

export async function requestFamilyControlsAuthorization(): Promise<boolean> {
  return false;
}

export async function presentFamilyActivityPickerAndGetSelection(): Promise<Selection | null> {
  return null;
}

// Placeholder component - shows "iOS only" message on web
export function DeviceActivitySelectionView(_props: any) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>App selection is iOS-only</Text>
      <Text style={styles.placeholderSubtext}>Use the mobile app to create locks with Screen Time</Text>
    </View>
  );
}

export function setFamilyActivitySelection(_selectionId: string, _familyActivitySelection: string): void {
  // no-op
}

export function getFamilyActivitySelection(_selectionId: string): string | undefined {
  return undefined;
}

export async function parseSelectionTokens(_familyActivitySelection: string): Promise<Selection> {
  return { applications: [], categories: [] };
}

// No-op subscription - returns object with remove method
export function onDeviceActivityMonitorEvent(_callback: (event: any) => void): { remove: () => void } {
  return { remove: () => {} };
}

export async function clearAllRestrictions(): Promise<void> {
  // no-op
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
