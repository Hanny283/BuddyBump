import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/ui/Button';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/firebase/AuthContext';
import { listLocksForCreator, listLocksForHolder } from '../../lib/locks/service';
import { Lock } from '../../lib/locks/types';
import { formatUserName } from '../../lib/locks/utils';
import {
  getAuthorizationStatus,
  requestFamilyControlsAuthorization,
} from '../../lib/screentime';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning,';
  if (h >= 12 && h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const [screenTimeAuthorized, setScreenTimeAuthorized] = useState<boolean | null>(null);
  const [sentLocks, setSentLocks] = useState<Lock[]>([]);
  const [heldLocks, setHeldLocks] = useState<Lock[]>([]);
  const [locksLoading, setLocksLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !user) return;

    async function authorizeScreenTime() {
      try {
        const currentStatus = getAuthorizationStatus();
        if (currentStatus === 2) {
          setScreenTimeAuthorized(true);
          return;
        }

        setScreenTimeAuthorized(false);
        setTimeout(async () => {
          const authorized = await requestFamilyControlsAuthorization();
          setScreenTimeAuthorized(authorized);
        }, 1000);
      } catch (error) {
        if (__DEV__) console.error('Error requesting Screen Time authorization:', error);
        setScreenTimeAuthorized(false);
      }
    }

    authorizeScreenTime();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    if (!user) return;
    setLocksLoading(true);
    try {
      const [sent, held] = await Promise.all([
        listLocksForCreator(user.uid),
        listLocksForHolder(user.uid),
      ]);
      setSentLocks(sent);
      setHeldLocks(held);
    } catch (error) {
      if (__DEV__) console.error('Error loading dashboard:', error);
    } finally {
      setLocksLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.welcomeText}>Welcome to TimeSync!</Text>
        <View style={styles.authButtons}>
          <Button title="Sign In" onPress={() => router.push('/signin')} />
          <Button title="Sign Up" onPress={() => router.push('/signup')} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const activeSent = sentLocks.filter(l => l.status === 'active').length;
  const activeHeld = heldLocks.filter(l => l.status === 'active').length;
  const blockedHeld = heldLocks.filter(l => l.status === 'active' && l.isBlocked).length;
  const activeBlockedLocks = heldLocks.filter(l => l.status === 'active' && l.isBlocked).slice(0, 2);
  const displayName = formatUserName({ email: user.email });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.displayName}>{displayName}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-circle" size={38} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Screen Time status */}
        {Platform.OS === 'ios' && screenTimeAuthorized === true && (
          <View style={styles.screenTimeActive}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.successText} />
            <Text style={styles.screenTimeActiveText}>Screen Time Active</Text>
          </View>
        )}

        {Platform.OS === 'ios' && screenTimeAuthorized === false && (
          <View style={styles.warningCard}>
            <View style={styles.warningRow}>
              <Ionicons name="warning" size={20} color={Colors.orange} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>Screen Time Access Required</Text>
                <Text style={styles.warningText}>
                  Grant Screen Time permission to create or hold locks.
                </Text>
              </View>
              <Button
                title="Grant"
                size="sm"
                onPress={requestFamilyControlsAuthorization}
                style={{ marginLeft: 8 }}
              />
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderTopColor: Colors.blue }]}>
            <Ionicons name="arrow-up-circle" size={22} color={Colors.blue} style={styles.statIcon} />
            <Text style={styles.statNumber}>{locksLoading ? '—' : activeSent}</Text>
            <Text style={styles.statLabel}>Locks Sent</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: Colors.green }]}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.green} style={styles.statIcon} />
            <Text style={styles.statNumber}>{locksLoading ? '—' : activeHeld}</Text>
            <Text style={styles.statLabel}>Locks Held</Text>
          </View>
          <View style={[
            styles.statCard,
            { borderTopColor: blockedHeld > 0 ? Colors.red : Colors.border },
            blockedHeld > 0 && styles.statCardBlocked,
          ]}>
            <Ionicons name="ban" size={22} color={blockedHeld > 0 ? Colors.red : Colors.textMuted} style={styles.statIcon} />
            <Text style={[styles.statNumber, blockedHeld > 0 && styles.statNumberBlocked]}>
              {locksLoading ? '—' : blockedHeld}
            </Text>
            <Text style={styles.statLabel}>Blocked Now</Text>
          </View>
        </View>

        {/* Active blocked locks summary */}
        {activeBlockedLocks.length > 0 && (
          <View style={styles.activeLockSection}>
            <Text style={styles.activeLockHeader}>Active Locks</Text>
            {activeBlockedLocks.map(lock => (
              <View key={lock.id} style={styles.activeLockCard}>
                <Ionicons name="ban" size={18} color={Colors.orange} />
                <Text style={styles.activeLockText}>
                  {lock.dailyMinutes} min — BLOCKED
                </Text>
                <Button
                  title="Request Unlock"
                  size="sm"
                  variant="secondary"
                  onPress={() => router.push(`/request-unlock/${lock.id}`)}
                  style={{ marginLeft: 'auto' }}
                />
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Create Lock"
            leftIcon="add-circle"
            onPress={async () => {
              try {
                const currentStatus = getAuthorizationStatus();
                if (currentStatus !== 2) {
                  const authorized = await requestFamilyControlsAuthorization();
                  if (!authorized) {
                    Alert.alert(
                      'Screen Time Access Required',
                      'Grant Screen Time permission to create locks. Go to Settings › Screen Time and allow TimeSync.'
                    );
                    return;
                  }
                }
                router.push('/select_apps');
              } catch (e) {
                Alert.alert('Error', `Failed to start lock creation: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          />

          {activeSent === 0 && activeHeld === 0 && (
            <View style={styles.infoTip}>
              <Ionicons name="information-circle" size={20} color={Colors.blue} style={{ marginRight: 10 }} />
              <Text style={styles.infoTipText}>
                Tap Create Lock to set a Screen Time limit and share an invite with a friend.
              </Text>
            </View>
          )}
        </View>
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
    flexGrow: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  displayName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  screenTimeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: -Spacing.md,
  },
  screenTimeActiveText: {
    fontSize: 12,
    color: Colors.successText,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  authButtons: {
    gap: 12,
    marginTop: 40,
    paddingHorizontal: 20,
  },
  warningCard: {
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 10,
    padding: 14,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.orange,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: Colors.orangeDark,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 3,
    padding: Spacing.base,
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 6,
  },
  statCardBlocked: {
    borderColor: Colors.warningBorder,
    backgroundColor: Colors.warningBg,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  statNumberBlocked: {
    color: Colors.orange,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  activeLockSection: {
    gap: 8,
  },
  activeLockHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  activeLockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.orange,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  activeLockText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
  infoTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  infoTipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
