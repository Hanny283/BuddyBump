import { Platform } from 'react-native';
import { 
  getAuthorizationStatus as getStatus, 
  requestAuthorization,
  pollAuthorizationStatus,
  AuthorizationStatus,
  onDeviceActivityMonitorEvent
} from 'react-native-device-activity';
import * as ReactNativeDeviceActivity from 'react-native-device-activity';

type Selection = {
  applications: string[];
  categories: string[];
};

/**
 * Get the current Family Controls authorization status
 * @returns 0 = notDetermined, 1 = denied, 2 = approved
 */
export function getAuthorizationStatus(): number {
  if (Platform.OS !== 'ios') return 1;
  
  try {
    return getStatus();
  } catch (error) {
    console.error('Failed to get Family Controls authorization status:', error);
    return 1;
  }
}

/**
 * Check if Family Controls is currently authorized
 * @returns true if authorized, false otherwise
 */
export function isFamilyControlsAuthorized(): boolean {
  return getAuthorizationStatus() === AuthorizationStatus.approved;
}

export async function requestFamilyControlsAuthorization(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  
  try {
    console.log('Requesting Family Controls authorization...');
    
    // Request authorization
    await requestAuthorization('individual');
    
    // Poll for status change (user response)
    console.log('Waiting for user response...');
    const finalStatus = await pollAuthorizationStatus({
      pollIntervalMs: 500,
      maxAttempts: 20
    });
    
    const authorized = finalStatus === AuthorizationStatus.approved;
    console.log('Final authorization status:', finalStatus, 'authorized:', authorized);
    
    return authorized;
  } catch (error) {
    console.error('Failed to request Family Controls authorization:', error);
    return false;
  }
}

export async function presentFamilyActivityPickerAndGetSelection(): Promise<Selection | null> {
  if (Platform.OS !== 'ios') return null;
  
  // Note: react-native-device-activity uses a component-based approach
  // This function should navigate to a screen with DeviceActivitySelectionView
  // For now, return null - the UI should navigate to /select_apps screen
  return null;
}

// Export the DeviceActivitySelectionView component for use in React components
export { DeviceActivitySelectionView } from 'react-native-device-activity';

// Export helper to set/get selection
export function setFamilyActivitySelection(selectionId: string, familyActivitySelection: string): void {
  try {
    ReactNativeDeviceActivity.setFamilyActivitySelectionId({
      id: selectionId,
      familyActivitySelection,
    });
  } catch (error) {
    console.error('Failed to store family activity selection:', error);
    throw error;
  }
}

export function getFamilyActivitySelection(selectionId: string): string | undefined {
  try {
    return ReactNativeDeviceActivity.getFamilyActivitySelectionId(selectionId);
  } catch (error) {
    console.error('Failed to get family activity selection:', error);
    return undefined;
  }
}

// Helper to parse selection tokens into applications and categories
export async function parseSelectionTokens(familyActivitySelection: string): Promise<Selection> {
  // The selection is a token string - we need to decode it
  // For now, return empty - this would require native code to decode tokens
  // react-native-device-activity should handle this internally
  return { applications: [], categories: [] };
}

// Event listener for Device Activity events
export { onDeviceActivityMonitorEvent };

// Emergency function to clear ALL Screen Time restrictions
export async function clearAllRestrictions(): Promise<void> {
  if (Platform.OS !== 'ios') {
    console.log('Screen Time only available on iOS');
    return;
  }
  
  try {
    console.log('🚨 CLEARING ALL SCREEN TIME RESTRICTIONS...');
    
    const { stopMonitoring, resetBlocks } = await import('react-native-device-activity');
    
    // Stop all monitoring activities (calling with no args stops all)
    stopMonitoring();
    console.log('✅ All monitoring stopped');
    
    // Clear all blocks and shields
    resetBlocks();
    console.log('✅ All blocks and shields cleared');
    
    console.log('✅ All restrictions cleared successfully!');
  } catch (error) {
    console.error('❌ Failed to clear restrictions:', error);
    throw error;
  }
}
