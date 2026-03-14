import { Ionicons } from '@expo/vector-icons';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/ui/Button';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/firebase/AuthContext';
import { logout } from '../../lib/firebase/auth';
import { formatUserName } from '../../lib/locks/utils';
import {
  clearAllRestrictions,
  getAuthorizationStatus,
  requestFamilyControlsAuthorization,
} from '../../lib/screentime';

export default function ProfileScreen() {
  const { user } = useAuth();

  const isAuthorized = Platform.OS === 'ios' && getAuthorizationStatus() === 2;

  const handleGrantScreenTime = async () => {
    try {
      await requestFamilyControlsAuthorization();
    } catch (error) {
      Alert.alert('Error', 'Failed to request Screen Time authorization');
    }
  };

  const handleClearRestrictions = () => {
    Alert.alert(
      'Clear All Restrictions',
      'This will remove all active Screen Time restrictions managed by TimeSync. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllRestrictions();
              Alert.alert('Done', 'All Screen Time restrictions cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear restrictions');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  if (!user) return null;

  const displayName = formatUserName({ email: user.email });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <Ionicons name="person-circle" size={72} color={Colors.textSecondary} />
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.rowGroup}>
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{user.email}</Text>
          </View>
          <View style={styles.rowDivider} />
          <TouchableOpacity
            style={styles.row}
            onPress={isAuthorized ? undefined : handleGrantScreenTime}
            activeOpacity={isAuthorized ? 1 : 0.7}
          >
            <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.rowLabel}>Screen Time</Text>
            {isAuthorized ? (
              <View style={styles.chip}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.successText} />
                <Text style={[styles.chipText, { color: Colors.successText }]}>Active</Text>
              </View>
            ) : (
              <View style={[styles.chip, { backgroundColor: Colors.warningBg }]}>
                <Text style={[styles.chipText, { color: Colors.orange }]}>Not Authorized</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {Platform.OS === 'ios' && (
          <>
            <Text style={styles.sectionLabel}>Danger Zone</Text>
            <View style={styles.rowGroup}>
              <Button
                title="Clear All Screen Time Restrictions"
                variant="ghost"
                onPress={handleClearRestrictions}
              />
            </View>
          </>
        )}

        <Button
          title="Sign Out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signOutBtn}
        />

        <Text style={styles.version}>TimeSync v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  email: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
    marginLeft: 4,
  },
  rowGroup: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.card,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 46,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    marginLeft: 12,
  },
  rowValue: {
    fontSize: 14,
    color: Colors.textMuted,
    maxWidth: 160,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  signOutBtn: {
    marginTop: Spacing.xl,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: Spacing.base,
  },
});
