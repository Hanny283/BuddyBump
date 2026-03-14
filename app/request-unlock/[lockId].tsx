import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/ui/Button';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/firebase/AuthContext';
import { createUnlockRequest, getLock, getPendingUnlockRequestForLock } from '../../lib/locks/service';
import { Lock, UnlockRequest } from '../../lib/locks/types';

export default function RequestUnlockScreen() {
  const { lockId } = useLocalSearchParams<{ lockId: string }>();
  const { user } = useAuth();
  const [lock, setLock] = useState<Lock | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');
  const [existingRequest, setExistingRequest] = useState<UnlockRequest | null>(null);

  useEffect(() => {
    async function loadLock() {
      if (!lockId) return;

      try {
        const lockData = await getLock(lockId);
        setLock(lockData);

        const pendingRequest = await getPendingUnlockRequestForLock(lockId);
        setExistingRequest(pendingRequest);
      } catch (error) {
        console.error('Error loading lock:', error);
        Alert.alert('Error', 'Failed to load lock');
      } finally {
        setLoading(false);
      }
    }

    loadLock();
  }, [lockId]);

  const handleRequestUnlock = async () => {
    if (!lock || !user) return;

    setRequesting(true);
    try {
      await createUnlockRequest(lock.id, message.trim() || undefined);

      Alert.alert(
        'Request Sent!',
        "Your lock holder will be notified. You'll get more time once they approve.",
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error requesting unlock:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send unlock request');
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lock) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Lock not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lock.isBlocked) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content}>
          <Ionicons name="hourglass-outline" size={72} color={Colors.textMuted} style={styles.iconCenter} />
          <Text style={styles.title}>Not Yet</Text>
          <Text style={styles.description}>
            You can only request an unlock after your {lock.dailyMinutes} minutes have run out.
          </Text>
          <Text style={styles.description}>
            Keep using your apps — you'll be able to request more time once the limit is reached.
          </Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (existingRequest) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content}>
          <Ionicons name="time-outline" size={72} color={Colors.orange} style={styles.iconCenter} />
          <Text style={styles.title}>Request Pending</Text>
          <Text style={styles.description}>
            Your unlock request is waiting for approval. You'll be notified when the lock holder responds.
          </Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Ionicons name="lock-open" size={72} color={Colors.blue} style={styles.iconCenter} />
        <Text style={styles.title}>Request Unlock</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Lock Time Limit:</Text>
          <Text style={styles.value}>{lock.dailyMinutes} minutes</Text>
        </View>

        <Text style={styles.description}>
          Request {lock.dailyMinutes} more minutes from your lock holder.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Add a message (optional)"
          placeholderTextColor={Colors.textMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={3}
          maxLength={200}
        />

        <View style={styles.buttonContainer}>
          <Button
            title={requesting ? 'Sending...' : 'Send Request'}
            onPress={handleRequestUnlock}
            disabled={requesting}
          />
          <Button title="Cancel" onPress={() => router.back()} disabled={requesting} variant="secondary" />
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
  },
  iconCenter: {
    textAlign: 'center',
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
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: 16,
    marginBottom: 24,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    gap: 12,
  },
  errorText: {
    fontSize: 18,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
});
