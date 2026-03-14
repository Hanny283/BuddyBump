/**
 * Re-exports from react-native-device-activity for native (iOS/Android).
 * Web builds use device-activity.web.ts instead.
 */
export {
  startMonitoring,
  stopMonitoring,
  blockSelection,
  resetBlocks,
  updateShield,
  updateShieldWithId,
  userDefaultsSet,
  setFamilyActivitySelectionId,
  getActivities,
} from 'react-native-device-activity';
