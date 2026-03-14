import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import Button from '../ui/Button';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { approveUnlockRequest, denyUnlockRequest, getLock, subscribeToUnlockRequests } from '../../lib/locks/service';
import { Lock, UnlockRequest } from '../../lib/locks/types';

interface UnlockRequestsListProps {
  userId: string;
  onRequestResolved?: () => void;
}

export default function UnlockRequestsList({ userId, onRequestResolved }: UnlockRequestsListProps) {
  const [requests, setRequests] = useState<UnlockRequest[]>([]);
  const [locks, setLocks] = useState<Record<string, Lock>>({});
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToUnlockRequests(userId, async (newRequests) => {
      setRequests(newRequests);

      const lockIds = newRequests.map(r => r.lockId);
      const uniqueLockIds = Array.from(new Set(lockIds));

      const lockPromises = uniqueLockIds.map(async (lockId) => {
        try {
          const lock = await getLock(lockId);
          return { lockId, lock };
        } catch (error) {
          console.error('Error loading lock:', lockId, error);
          return { lockId, lock: null };
        }
      });

      const results = await Promise.all(lockPromises);
      const locksMap: Record<string, Lock> = {};
      results.forEach(({ lockId, lock }) => {
        if (lock) locksMap[lockId] = lock;
      });

      setLocks(locksMap);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleApprove = async (request: UnlockRequest) => {
    setProcessingIds(prev => new Set(prev).add(request.id));

    try {
      await approveUnlockRequest(request.id);
      Alert.alert('Approved', 'Unlock request approved! Timer has been reset.');
      onRequestResolved?.();
    } catch (error) {
      console.error('Error approving request:', error);
      Alert.alert('Error', 'Failed to approve unlock request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  };

  const handleDeny = async (request: UnlockRequest) => {
    Alert.alert(
      'Deny Unlock Request',
      'Are you sure you want to deny this unlock request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            setProcessingIds(prev => new Set(prev).add(request.id));

            try {
              await denyUnlockRequest(request.id);
              onRequestResolved?.();
            } catch (error) {
              console.error('Error denying request:', error);
              Alert.alert('Error', 'Failed to deny unlock request');
            } finally {
              setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(request.id);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={Colors.blue} />
      </View>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Unlock Requests</Text>
      {requests.map((request) => {
        const lock = locks[request.lockId];
        const isProcessing = processingIds.has(request.id);
        const creatorName = request.creatorName || 'Someone';

        return (
          <View key={request.id} style={styles.requestCard}>
            <Ionicons name="lock-open" size={24} color={Colors.orange} style={styles.requestIcon} />
            <View style={styles.requestHeader}>
              <Text style={styles.requestTitle}>{creatorName} needs more time</Text>
              <Text style={styles.requestSubtitle}>
                Requesting {lock?.dailyMinutes || '?'} more minutes
              </Text>
              <Text style={styles.requestTime}>
                {new Date(request.requestedAt).toLocaleTimeString()}
              </Text>
            </View>

            {request.message && (
              <View style={styles.messageContainer}>
                <Text style={styles.messageLabel}>Message:</Text>
                <Text style={styles.message}>"{request.message}"</Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <Button
                title={isProcessing ? 'Processing...' : 'Grant Time'}
                onPress={() => handleApprove(request)}
                disabled={isProcessing}
                style={[styles.approveButton, { flex: 1 }]}
              />
              <Button
                title="Deny"
                onPress={() => handleDeny(request)}
                disabled={isProcessing}
                variant="danger"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
    textAlign: 'center',
  },
  requestCard: {
    backgroundColor: '#1F1F23',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: Colors.border,
    borderLeftColor: Colors.orange,
  },
  requestIcon: {
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  requestHeader: {
    marginBottom: Spacing.base,
    alignItems: 'center',
  },
  requestTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  requestSubtitle: {
    fontSize: 16,
    color: Colors.orange,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  requestTime: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  messageContainer: {
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  messageLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  approveButton: {
    backgroundColor: Colors.green,
  },
});
