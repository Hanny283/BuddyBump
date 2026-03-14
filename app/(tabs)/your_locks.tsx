import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnlockRequestsList from '../../components/feature/UnlockRequestsList';
import LockCard from '../../components/ui/LockCard';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/firebase/AuthContext';
import { useDeepLink } from '../../lib/locks/DeepLinkProvider';
import { acceptLock, cancelLock, deleteLock, listLocksForCreator, listLocksForHolder } from '../../lib/locks/service';
import { Lock } from '../../lib/locks/types';

function SectionHeader({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={sectionHeaderStyles.row}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} />
      <Text style={sectionHeaderStyles.label}>{label}</Text>
      <View style={sectionHeaderStyles.line} />
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.base,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 12,
  },
});

export default function YourLocksScreen() {
  const { user } = useAuth();
  const { pendingInvite, pendingLock, clearPendingInvite } = useDeepLink();
  const [sentLocks, setSentLocks] = useState<Lock[]>([]);
  const [heldLocks, setHeldLocks] = useState<Lock[]>([]);
  const [pendingLocks, setPendingLocks] = useState<Lock[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadLocks();
    }
  }, [user]);

  useEffect(() => {
    if (pendingLock && user) {
      if (pendingLock.status === 'pending' && pendingLock.creatorUserId !== user.uid) {
        setPendingLocks((prev) => {
          if (prev.find((l) => l.id === pendingLock.id)) return prev;
          return [pendingLock, ...prev];
        });
      }
    }
  }, [pendingLock, user]);

  const loadLocks = async (isRefreshing = false) => {
    if (!user) return;

    try {
      if (!isRefreshing) setLoading(true);
      const [sent, held] = await Promise.all([
        listLocksForCreator(user.uid),
        listLocksForHolder(user.uid),
      ]);
      setSentLocks(sent);
      setHeldLocks(held);

      setPendingLocks((prev) =>
        prev.filter(
          (pl) =>
            !held.find((h) => h.id === pl.id) &&
            !sent.find((s) => s.id === pl.id) &&
            pl.status === 'pending'
        )
      );
    } catch (error) {
      console.error('Error loading locks:', error);
      Alert.alert('Error', 'Failed to load locks');
    } finally {
      if (isRefreshing) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLocks(true);
  };

  const handleAcceptLock = async (lock: Lock) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to accept a lock');
      return;
    }
    if (lock.creatorUserId === user.uid) {
      Alert.alert('Error', 'You cannot accept a lock you created');
      return;
    }
    if (lock.status !== 'pending') {
      Alert.alert('Cannot Accept', `This lock is already ${lock.status}.`, [
        { text: 'OK', onPress: () => loadLocks() },
      ]);
      return;
    }

    Alert.alert(
      'Accept Lock',
      `This will limit your access to the selected apps to ${lock.dailyMinutes} minutes per day. Do you want to continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await acceptLock(lock.id, user.uid);
              setPendingLocks((prev) => prev.filter((l) => l.id !== lock.id));
              if (pendingInvite === lock.inviteId) clearPendingInvite();
              await loadLocks();
              Alert.alert(
                'Success',
                `Lock accepted!\n• Daily limit: ${lock.dailyMinutes} minutes\n• Apps: ${lock.appTokens?.length || 0} selected`
              );
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to accept lock.');
              await loadLocks();
            }
          },
        },
      ]
    );
  };

  const handleCancelLock = async (lock: Lock) => {
    Alert.alert(
      'Cancel Lock',
      `Are you sure? ${lock.status === 'active' ? 'Screen Time restrictions will be removed.' : 'The recipient can no longer accept it.'}`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelLock(lock.id);
              await loadLocks();
              Alert.alert('Success', 'Lock has been cancelled.');
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to cancel lock.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteLock = async (lock: Lock) => {
    if (!user) return;
    try {
      await deleteLock(lock.id, user.uid);
      if (lock.holderUserId === user.uid) {
        setHeldLocks((prev) => prev.filter((l) => l.id !== lock.id));
      } else if (lock.creatorUserId === user.uid) {
        setSentLocks((prev) => prev.filter((l) => l.id !== lock.id));
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete lock.');
    }
  };

  const renderDeleteAction = (lock: Lock) => (
    <View style={styles.deleteAction}>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteLock(lock)}>
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLock = (lock: Lock, role: 'creator' | 'holder', allowDelete: boolean) => {
    const canDelete =
      allowDelete &&
      (lock.holderUserId === user?.uid ||
        (lock.creatorUserId === user?.uid && lock.status === 'cancelled'));

    const card = (
      <LockCard
        lock={lock}
        role={role}
        onAccept={role === 'holder' ? () => handleAcceptLock(lock) : undefined}
        onCancel={role === 'creator' ? () => handleCancelLock(lock) : undefined}
        onRequestUnlock={
          role === 'holder' ? () => router.push(`/request-unlock/${lock.id}`) : undefined
        }
        onDelete={canDelete ? () => handleDeleteLock(lock) : undefined}
      />
    );

    if (canDelete) {
      return (
        <Swipeable
          key={lock.id}
          renderRightActions={() => renderDeleteAction(lock)}
          overshootRight={false}
        >
          {card}
        </Swipeable>
      );
    }

    return <View key={lock.id}>{card}</View>;
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.title}>Locks</Text>
        <Text style={styles.emptyText}>Please log in to view your locks</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Locks</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.blue}
            title="Pull to refresh"
            titleColor={Colors.textSecondary}
          />
        }
      >
        {user && (
          <UnlockRequestsList userId={user.uid} onRequestResolved={() => loadLocks()} />
        )}

        {pendingLocks.length > 0 && (
          <>
            <SectionHeader icon="time-outline" label="Pending Invites" />
            {pendingLocks.map((lock) => renderLock(lock, 'holder', false))}
          </>
        )}

        <SectionHeader icon="arrow-up-circle-outline" label="Locks Sent" />
        {sentLocks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="lock-open-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyStateTitle}>No locks yet</Text>
            <Text style={styles.emptyStateSub}>Tap Create Lock on the Home tab</Text>
          </View>
        ) : (
          sentLocks.map((lock) => renderLock(lock, 'creator', true))
        )}

        <SectionHeader icon="shield-outline" label="Locks Held" />
        {heldLocks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="lock-open-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyStateTitle}>No locks yet</Text>
            <Text style={styles.emptyStateSub}>Accept an invite link to hold a lock for a friend</Text>
          </View>
        ) : (
          heldLocks.map((lock) => renderLock(lock, 'holder', true))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    paddingBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  refreshBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyStateTitle: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    padding: 12,
  },
  deleteAction: {
    backgroundColor: Colors.red,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  deleteBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
