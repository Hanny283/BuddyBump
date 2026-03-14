import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnlockRequestsList from '../../components/feature/UnlockRequestsList';
import Button from '../../components/ui 2/Button';
import { useAuth } from '../../lib/firebase/AuthContext';
import { useDeepLink } from '../../lib/locks/DeepLinkProvider';
import { acceptLock, cancelLock, deleteLock, listLocksForCreator, listLocksForHolder } from '../../lib/locks/service';
import { Lock } from '../../lib/locks/types';

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

  // When a pending lock is loaded from deep link, add it to pending locks
  useEffect(() => {
    if (pendingLock && user) {
      // Only add if it's a pending lock and user is not the creator
      if (pendingLock.status === 'pending' && pendingLock.creatorUserId !== user.uid) {
        console.log('Adding pending lock to list:', pendingLock.id);
        setPendingLocks((prev) => {
          // Check if this lock is already in pending locks
          if (prev.find((l) => l.id === pendingLock.id)) {
            return prev;
          }
          return [pendingLock, ...prev];
        });
      } else if (pendingLock.status === 'active' && pendingLock.holderUserId === user.uid) {
        // If lock is already active and user is the holder, it should be in held locks
        console.log('Pending lock is already active, will appear in held locks after reload');
      }
    }
  }, [pendingLock, user]);

  const loadLocks = async (isRefreshing = false) => {
    if (!user) return;

    try {
      if (!isRefreshing) {
        setLoading(true);
      }
      const [sent, held] = await Promise.all([
        listLocksForCreator(user.uid),
        listLocksForHolder(user.uid),
      ]);
      setSentLocks(sent);
      setHeldLocks(held);
      
      // Clear pending locks that are now in held locks or sent locks
      // This prevents showing stale "accept" buttons for already-accepted locks
      setPendingLocks((prev) => 
        prev.filter(pendingLock => 
          !held.find(h => h.id === pendingLock.id) && 
          !sent.find(s => s.id === pendingLock.id) &&
          pendingLock.status === 'pending' // Only keep truly pending locks
        )
      );
      
      console.log('Locks loaded - sent:', sent.length, 'held:', held.length);
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

    // Prevent accepting your own lock
    if (lock.creatorUserId === user.uid) {
      Alert.alert('Error', 'You cannot accept a lock you created');
      return;
    }

    // Prevent accepting non-pending locks
    if (lock.status !== 'pending') {
      Alert.alert(
        'Cannot Accept', 
        `This lock is already ${lock.status}. The page will refresh to show the current status.`,
        [{ text: 'OK', onPress: () => loadLocks() }]
      );
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Accept Lock',
      `This will limit your access to the selected apps to ${lock.dailyMinutes} minutes per day. The restriction will be active immediately. Do you want to continue?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              console.log('Accepting lock:', lock.id);
              await acceptLock(lock.id, user.uid);
              console.log('Lock accepted successfully');
              
              // Remove from pending locks immediately
              setPendingLocks((prev) => prev.filter((l) => l.id !== lock.id));
              
              // Clear pending invite if this was the one from deep link
              if (pendingInvite === lock.inviteId) {
                console.log('Clearing pending invite from deep link');
                clearPendingInvite();
              }
              
              // Reload locks to refresh the list (will show in held locks)
              await loadLocks();
              
              Alert.alert(
                'Success', 
                `Lock accepted! Screen Time restrictions are now active.\n\n• Daily limit: ${lock.dailyMinutes} minutes\n• Apps: ${lock.appTokens?.length || 0} selected\n• Resets daily at midnight`
              );
            } catch (error) {
              console.error('Error accepting lock:', error);
              const errorMessage = error instanceof Error ? error.message : 'Failed to accept lock. Please try again.';
              Alert.alert('Error', errorMessage);
              
              // Reload locks to ensure UI is in sync with server state
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
      `Are you sure you want to cancel this lock? ${lock.status === 'active' ? 'Screen Time restrictions will be removed.' : 'The recipient will no longer be able to accept it.'}`,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Cancelling lock:', lock.id);
              await cancelLock(lock.id);
              console.log('Lock cancelled successfully');
              
              // Reload locks to refresh the list
              await loadLocks();
              
              Alert.alert('Success', 'Lock has been cancelled.');
            } catch (error) {
              console.error('Error cancelling lock:', error);
              const errorMessage = error instanceof Error ? error.message : 'Failed to cancel lock. Please try again.';
              Alert.alert('Error', errorMessage);
            }
          },
        },
      ]
    );
  };

  const handleDeleteLock = async (lock: Lock) => {
    if (!user) return;

    try {
      console.log('Deleting lock:', lock.id);
      await deleteLock(lock.id, user.uid);
      console.log('Lock deleted successfully');
      
      // If holder deleted an active lock, it becomes cancelled (not deleted)
      // Reload locks to show the updated status
      if (lock.holderUserId === user.uid && lock.status === 'active') {
        // Lock was cancelled, remove from held locks
        setHeldLocks((prev) => prev.filter((l) => l.id !== lock.id));
      } else {
        // Lock was deleted (removed from UI)
        if (lock.holderUserId === user.uid) {
          setHeldLocks((prev) => prev.filter((l) => l.id !== lock.id));
        } else if (lock.creatorUserId === user.uid) {
          setSentLocks((prev) => prev.filter((l) => l.id !== lock.id));
        }
      }
    } catch (error) {
      console.error('Error deleting lock:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete lock. Please try again.';
      Alert.alert('Error', errorMessage);
    }
  };

  const renderDeleteButton = (lock: Lock) => {
    return (
      <View style={styles.deleteButtonContainer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteLock(lock)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTimeSyncem = (lock: Lock, showAcceptButton: boolean = false, showCancelButton: boolean = false, showRequestUnlock: boolean = false, allowDelete: boolean = false) => {
    const lockContent = (
      <View style={styles.lockItem}>
        <View style={styles.lockInfo}>
          <Text style={styles.lockStatus}>
            Status: {lock.status === 'pending' ? 'Pending' : lock.status === 'active' ? lock.isBlocked ? '🔒 Blocked' : 'Active' : 'Cancelled'}
          </Text>
          <Text style={styles.lockDetail}>Daily Limit: {lock.dailyMinutes} minutes</Text>
          <Text style={styles.lockDetail}>Apps: {lock.appTokens?.length || 0} selected</Text>
          {lock.isBlocked && (
            <Text style={styles.blockedText}>⏱️ Time's up! Request unlock to continue.</Text>
          )}
          {showAcceptButton && lock.status === 'pending' && (
            <Button
              title="Accept Lock"
              onPress={() => handleAcceptLock(lock)}
              style={styles.acceptButton}
            />
          )}
          {/* Only show request unlock button when lock is blocked (time ran out) */}
          {showRequestUnlock && lock.status === 'active' && lock.isBlocked && (
            <TouchableOpacity
              style={styles.requestUnlockButton}
              onPress={() => router.push(`/request-unlock/${lock.id}`)}
            >
              <Text style={styles.requestUnlockText}>🔓 Request Unlock</Text>
            </TouchableOpacity>
          )}
          {showCancelButton && lock.status !== 'cancelled' && (
            <Button
              title="Cancel Lock"
              onPress={() => handleCancelLock(lock)}
              style={[styles.acceptButton, styles.cancelButton]}
            />
          )}
        </View>
      </View>
    );

    // Allow delete if:
    // 1. User is holder (can delete active or cancelled locks) OR
    // 2. User is creator of cancelled lock
    const canDelete = allowDelete && 
      ((lock.holderUserId === user?.uid) || 
       (lock.creatorUserId === user?.uid && lock.status === 'cancelled'));
    
    if (canDelete) {
      return (
        <Swipeable
          key={lock.id}
          renderRightActions={() => renderDeleteButton(lock)}
          overshootRight={false}
        >
          {lockContent}
        </Swipeable>
      );
    }

    return <View key={lock.id}>{lockContent}</View>;
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.title}>Your Locks</Text>
        <Text style={styles.emptyText}>Please log in to view your locks</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>Your Locks</Text>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
            title="Pull to refresh"
            titleColor="#A1A1AA"
          />
        }
      >
        {user && (
          <UnlockRequestsList 
            userId={user.uid} 
            onRequestResolved={() => loadLocks()}
          />
        )}
        
        {pendingLocks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pending Invites</Text>
            <View style={styles.sectionList}>
              {pendingLocks.map((lock) => renderTimeSyncem(lock, true))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Locks Sent</Text>
        <View style={styles.sectionList}>
          {sentLocks.length === 0 ? (
            <Text style={styles.emptyText}>No locks sent yet</Text>
          ) : (
            <>
              {sentLocks.map((lock) => renderTimeSyncem(lock, false, true, true, true))}
              {sentLocks.some(lock => lock.status === 'cancelled') && (
                <Text style={styles.hintText}>💡 Swipe left on cancelled locks to delete</Text>
              )}
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Locks Held</Text>
        <View style={styles.sectionList}>
          {heldLocks.length === 0 ? (
            <Text style={styles.emptyText}>No active locks</Text>
          ) : (
            <>
              {heldLocks.map((lock) => renderTimeSyncem(lock, false, false, false, true))}
              {heldLocks.length > 0 && (
                <Text style={styles.hintText}>💡 Swipe left on any lock to delete</Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EDEDED',
    marginBottom: 16,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EDEDED',
    marginBottom: 8,
    marginTop: 12,
  },
  sectionList: {
    backgroundColor: '#15151C',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 12,
    marginBottom: 16,
  },
  lockItem: {
    backgroundColor: '#1F1F23',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  lockInfo: {
    gap: 4,
  },
  lockStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EDEDED',
  },
  lockDetail: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  acceptButton: {
    marginTop: 8,
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  requestUnlockButton: {
    backgroundColor: '#F59E0B',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  requestUnlockText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    padding: 12,
  },
  blockedText: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 4,
  },
  deleteButtonContainer: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hintText: {
    fontSize: 12,
    color: '#71717A',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 12,
  },
});


