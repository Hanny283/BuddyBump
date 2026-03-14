/**
 * Banner shown only on web to indicate demo/limited functionality.
 * Not rendered on native - Platform.OS check ensures zero impact on mobile build.
 */
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';

export default function WebDemoBanner() {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="globe-outline" size={16} color="#fff" />
      <Text style={styles.text}>Web Demo — Screen Time blocking is iOS-only. Create & view locks for demo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a3a52',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});
