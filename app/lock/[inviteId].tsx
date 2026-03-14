import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/ui/Button';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/firebase/AuthContext';
import { acceptLock, getLockByInviteId } from '../../lib/locks/service';
import { Lock } from '../../lib/locks/types';

export default function AcceptLockScreen() {
  const { inviteId } = useLocalSearchParams<{ inviteId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [lock, setLock] = useState<Lock | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLock() {
      if (!inviteId) {
        setError('Invalid invite link');
        setLoading(false);
        return;
      }

      try {
        const lockData = await getLockByInviteId(inviteId);

        if (!lockData) {
          setError('Lock not found. It may have been cancelled or already accepted.');
          setLoading(false);
          return;
        }

        if (lockData.status === 'active') {
          setError('This lock has already been accepted and is now active.');
          setLoading(false);
          return;
        }

        if (lockData.status === 'cancelled') {
          setError('This lock has been cancelled.');
          setLoading(false);
          return;
        }

        if (lockData.status !== 'pending') {
          setError(`This lock is ${lockData.status} and cannot be accepted.`);
          setLoading(false);
          return;
        }

        setLock(lockData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading lock:', err);
        setError('Failed to load lock invitation. Please try again.');
        setLoading(false);
      }
    }

    if (!authLoading) {
      if (!user) {
        setError('Please sign in to accept this lock invitation');
        setLoading(false);
      } else {
        loadLock();
      }
    }
  }, [inviteId, user, authLoading]);

  const handleAccept = async () => {
    if (!lock || !user) return;

    if (lock.status !== 'pending') {
      Alert.alert('Cannot Accept', `This lock is already ${lock.status} and cannot be accepted.`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/your_locks') },
      ]);
      return;
    }

    setAccepting(true);
    try {
      await acceptLock(lock.id, user.uid);
      Alert.alert('Lock Accepted!', 'The lock has been activated on your device.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/your_locks') },
      ]);
    } catch (err) {
      console.error('Error accepting lock:', err);
      Alert.alert('Error', 'Failed to accept lock. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    Alert.alert('Decline Lock', 'Are you sure you want to decline this lock invitation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => router.replace('/(tabs)') },
    ]);
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.blue} />
          <Text style={styles.loadingText}>Loading invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed" size={56} color={Colors.blue} />
          </View>
          <Text style={styles.errorText}>Please sign in to accept this lock invitation</Text>
          <View style={styles.buttonContainer}>
            <Button title="Sign In" onPress={() => router.push('/signin')} />
            <Button title="Sign Up" onPress={() => router.push('/signup')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <Ionicons name="close-circle" size={72} color={Colors.red} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Go Home" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lock) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <Ionicons name="close-circle" size={72} color={Colors.red} />
          <Text style={styles.errorText}>Lock not found</Text>
          <Button title="Go Home" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-closed" size={56} color={Colors.blue} />
        </View>

        <Text style={styles.title}>Lock Invitation</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Daily Time Limit:</Text>
          <Text style={styles.value}>{lock.dailyMinutes} minutes</Text>

          <View style={styles.infoRows}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>Resets at midnight</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="apps-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{lock.appTokens?.length || 0} apps restricted</Text>
            </View>
          </View>
        </View>

        <Text style={styles.description}>
          By accepting, the selected apps will be restricted to {lock.dailyMinutes} minutes per day on your device.
        </Text>

        <View style={styles.buttonContainer}>
          <Button
            title={accepting ? 'Accepting...' : 'Accept Lock'}
            onPress={handleAccept}
            disabled={accepting}
          />
          <Button title="Decline" onPress={handleDecline} disabled={accepting} variant="secondary" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.base,
  },
  iconBox: {
    backgroundColor: Colors.card,
    borderRadius: 40,
    padding: 20,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1F1F23',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 5,
  },
  value: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  infoRows: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  description: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  errorText: {
    fontSize: 18,
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
