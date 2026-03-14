import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/ui 2/Button';
import { useAuth } from '../../lib/firebase/AuthContext';
import { logout } from '../../lib/firebase/auth';
import {
    DeviceActivitySelectionView,
    getAuthorizationStatus,
    requestFamilyControlsAuthorization,
    setFamilyActivitySelection
} from '../../lib/screentime';

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const [screenTimeAuthorized, setScreenTimeAuthorized] = useState<boolean | null>(null);
  const [testLockId, setTestLockId] = useState<string | null>(null);
  const [testRequestId, setTestRequestId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string>('Ready');
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [testAppSelection, setTestAppSelection] = useState<string | null>(null);

  // Request Screen Time authorization when app loads (if user is authenticated)
  useEffect(() => {
    async function requestScreenTimeAuthorization() {
      if (Platform.OS !== 'ios' || !user) return;
      
      try {
        // Check current authorization status
        const currentStatus = getAuthorizationStatus();
        console.log('Screen Time authorization status on app load:', currentStatus);
        
        // If already approved (status === 2), no need to prompt
        if (currentStatus === 2) {
          console.log('Screen Time already authorized');
          setScreenTimeAuthorized(true);
          return;
        }
        
        // For denied (status === 1) or not determined (status === 0):
        // Request authorization on every app load
        // This is important for Expo Go where Settings don't have app-specific options
        // iOS will handle rate limiting if user keeps denying
        console.log('Screen Time not authorized, requesting permission...');
        setScreenTimeAuthorized(false);
        
        // Small delay to ensure UI is ready
        setTimeout(async () => {
          const authorized = await requestFamilyControlsAuthorization();
          setScreenTimeAuthorized(authorized);
          
          if (!authorized) {
            console.log('Screen Time authorization was not granted');
            // Don't show an alert here - they just saw the prompt
            // They can try again via Create Lock button or next app launch
          } else {
            console.log('Screen Time authorization granted!');
          }
        }, 1000);
      } catch (error) {
        console.error('Error requesting Screen Time authorization:', error);
        setScreenTimeAuthorized(false);
      }
    }

    async function requestContacts() {
      if (Platform.OS !== 'ios') return;
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('Contacts permission status:', status);
    }

    if (user) {
      requestContacts();
      requestScreenTimeAuthorization();
    }
  }, [user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
            <View style={styles.spacer} />
          <Button
            title="Sign Out"
            onPress={async () => {
              try {
                await logout();
              } catch (error) {
                console.error('Sign out error:', error);
              }
            }}
          />
        </View>
        <Text style={styles.welcomeText}>Welcome to Lock It!</Text>
        <Text style={styles.userText}>Hello, {user.email}!</Text>
        {/* UNLOCK REQUEST TEST FLOW */}
        <View style={styles.testSection}>
          <Text style={styles.testTitle}>🧪 Unlock Request Test</Text>
          <Text style={styles.testStatus}>{testStatus}</Text>
          
          {!showAppPicker ? (
            <Button
              title="🧪 Start Unlock Test"
              onPress={() => {
                setShowAppPicker(true);
                setTestStatus('Select Instagram (or any app) below');
              }}
            />
          ) : (
            <>
              {Platform.OS === 'ios' && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Select Instagram:</Text>
                  <DeviceActivitySelectionView
                    onSelectionChange={(event) => {
                      setTestAppSelection(event.nativeEvent.familyActivitySelection);
                      setTestStatus('Apps selected! Click "Run Test" below');
                    }}
                    familyActivitySelection={testAppSelection}
                    style={styles.picker}
                  />
                </View>
              )}
              
              <Button
                title="▶️ Run Test"
                onPress={async () => {
                  try {
                    if (!testAppSelection) {
                      Alert.alert('No Apps Selected', 'Please select Instagram or another app first');
                      return;
                    }
                    
                    setTestStatus('Creating test lock...');
                    
                    const { createLockInvite, acceptLock } = await import('../../lib/locks/service');
                    const { db } = await import('../../lib/firebase/config');
                    const { doc, getDoc } = await import('firebase/firestore');
                    
                    // Store the selection for future use
                    setFamilyActivitySelection('testSelection', testAppSelection);
                    
                    // 2. Create lock (creator = you, holder = pending)
                    const lock = await createLockInvite({
                      appTokens: [testAppSelection],
                      dailyMinutes: 1,
                      creatorUserId: user!.uid,
                    });
                    console.log('✅ Test lock created:', lock.id);
                    setTestLockId(lock.id);
                    setTestStatus('Lock created, accepting...');
                    
                    // Small delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 3. Accept lock as yourself (this triggers monitoring via listener)
                    await acceptLock(lock.id, user!.uid);
                    console.log('✅ Lock accepted - monitoring should start automatically!');
                    setTestStatus('Lock active! Verifying...');
                    
                    // Verify the lock was properly updated
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const lockRef = doc(db, 'locks', lock.id);
                    const verifySnap = await getDoc(lockRef);
                    if (verifySnap.exists()) {
                      const lockData = verifySnap.data();
                      console.log('🔍 Lock verification:', {
                        id: lock.id,
                        status: lockData.status,
                        holderUserId: lockData.holderUserId,
                        creatorUserId: lockData.creatorUserId
                      });
                      
                      if (lockData.status !== 'active') {
                        throw new Error('Lock status is not active: ' + lockData.status);
                      }
                      if (!lockData.holderUserId) {
                        throw new Error('Lock holderUserId was not set');
                      }
                    }
                    
                    setTestStatus('Lock verified! Waiting for monitoring...');
                    
                    // Wait for monitoring to start (the listener in _layout.tsx handles this)
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    setTestStatus('✅ Ready! Open app and wait 1 min');
                    
                    Alert.alert(
                      '✅ Test Setup Complete!',
                      'Lock is now active on YOUR device.\n\n1. Open the selected app\n2. Wait 1 minute for time to run out\n3. Shield should appear - click "Request Unlock"\n4. Come back here and click "Approve Unlock Request"',
                      [{ text: 'OK' }]
                    );
                  } catch (error) {
                    console.error('Test flow error:', error);
                    setTestStatus('Error: ' + (error as Error).message);
                    Alert.alert('Test Failed', (error as Error).message);
                  }
                }}
                disabled={!testAppSelection}
              />
              
              <Button
                title="❌ Cancel"
                onPress={() => {
                  setShowAppPicker(false);
                  setTestAppSelection(null);
                  setTestStatus('Ready');
                }}
                variant="secondary"
              />
            </>
          )}
          
          {testLockId && (
            <Button
              title="✅ Approve Unlock Request"
              onPress={async () => {
                try {
                  console.log('🔓🔓🔓 APPROVE BUTTON CLICKED');
                  console.log('Test lock ID:', testLockId);
                  console.log('Current user:', user?.uid);
                  
                  setTestStatus('Finding unlock request...');
                  
                  const { collection, query, where, getDocs } = await import('firebase/firestore');
                  const { db } = await import('../../lib/firebase/config');
                  const { approveUnlockRequest } = await import('../../lib/locks/service');
                  
                  console.log('📋 Querying for unlock requests...');
                  console.log('Query params: lockId =', testLockId, ', status = pending');
                  
                  // Find the pending unlock request for this lock
                  let requestsQuery;
                  let requestsSnap;
                  
                  try {
                    requestsQuery = query(
                      collection(db, 'unlockRequests'),
                      where('lockId', '==', testLockId),
                      where('status', '==', 'pending')
                    );
                    console.log('✅ Query created');
                    
                    requestsSnap = await getDocs(requestsQuery);
                    console.log('✅ Query executed, found', requestsSnap.size, 'request(s)');
                  } catch (queryError) {
                    console.error('❌ Query failed:', queryError);
                    throw new Error(`Query failed: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
                  }
                  
                  if (requestsSnap.empty) {
                    console.warn('⚠️ No unlock requests found');
                    Alert.alert(
                      'No Request Found',
                      'No pending unlock request found. Make sure you:\n1. Opened the app\n2. Saw the shield screen\n3. Clicked "Request Unlock"'
                    );
                    setTestStatus('No unlock request found');
                    return;
                  }
                  
                  const requestId = requestsSnap.docs[0].id;
                  const requestData = requestsSnap.docs[0].data();
                  console.log('✅ Found unlock request:', requestId);
                  console.log('Request data:', {
                    creatorUserId: requestData.creatorUserId,
                    holderUserId: requestData.holderUserId,
                    status: requestData.status
                  });
                  
                  setTestStatus('Approving unlock request...');
                  console.log('🔓 Calling approveUnlockRequest...');
                  
                  try {
                    await approveUnlockRequest(requestId);
                    console.log('✅✅✅ approveUnlockRequest completed successfully!');
                  } catch (approveError) {
                    console.error('❌ approveUnlockRequest FAILED:', approveError);
                    throw approveError;
                  }
                  
                  console.log('✅ Unlock request approved - restrictions cleared!');
                  setTestStatus('✅ Unlocked! Apps should work now');
                  setTestLockId(null);
                  setTestRequestId(null);
                  setShowAppPicker(false);
                  setTestAppSelection(null);
                  
                  Alert.alert(
                    '✅ Unlock Approved!',
                    'Selected app should now be accessible. Try opening it!',
                    [{ text: 'OK' }]
                  );
                } catch (error) {
                  console.error('❌❌❌ Approve button error:', error);
                  console.error('Error details:', {
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code,
                    name: error instanceof Error ? error.name : typeof error
                  });
                  setTestStatus('Approve failed: ' + (error as Error).message);
                  Alert.alert('Approval Failed', (error as Error).message);
                }
              }}
              variant="primary"
            />
          )}
        </View>

        <Button
          title="🚨 Emergency: Clear Everything"
          onPress={async () => {
            if (Platform.OS !== 'ios') {
              Alert.alert('iOS Only', 'Screen Time is only available on iOS');
              return;
            }
            
            Alert.alert(
              '🚨 Emergency Clear',
              'This will:\n• Remove ALL Screen Time blocks\n• Delete ALL your locks\n• Stop all monitoring\n\nUse this if anything gets stuck.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      console.log('🚨 EMERGENCY - Clearing all restrictions and locks...');
                      
                      // 1. Stop all Screen Time monitoring and clear blocks
                      const { resetBlocks, stopMonitoring } = await import('react-native-device-activity');
                      stopMonitoring();
                      console.log('✅ All monitoring stopped');
                      resetBlocks();
                      console.log('✅ All blocks cleared');
                      
                      // 2. Delete all locks from Firestore
                      if (user) {
                        const { listLocksForCreator, listLocksForHolder, cancelLock } = await import('../../lib/locks/service');
                        
                        // Get all locks
                        const [createdLocks, heldLocks] = await Promise.all([
                          listLocksForCreator(user.uid),
                          listLocksForHolder(user.uid)
                        ]);
                        
                        // Cancel all locks (this handles Screen Time cleanup too)
                        const allLocks = [...createdLocks, ...heldLocks];
                        const deletePromises = allLocks.map(lock => {
                          if (lock.status === 'active') {
                            return cancelLock(lock.id).catch(err => {
                              console.error(`Failed to cancel lock ${lock.id}:`, err);
                            });
                          }
                          return Promise.resolve();
                        });
                        
                        await Promise.all(deletePromises);
                        console.log(`✅ Cancelled ${allLocks.length} locks`);
                      }
                      
                      Alert.alert(
                        '✅ All Clear!',
                        'All locks and restrictions have been removed. If anything is still blocked, restart your device.'
                      );
                    } catch (error) {
                      console.error('❌ Emergency clear failed:', error);
                      Alert.alert('Error', 'Failed to clear everything. Try restarting your device.');
                    }
                  }
                }
              ]
            );
          }}
          variant="secondary"
        />

        <Button
          title="Create Lock"
          onPress={async () => {
            try {
              // First, check current authorization status
              const currentStatus = getAuthorizationStatus();
              console.log('Current Screen Time status on Create Lock:', currentStatus);
              
              // If already approved, proceed directly
              if (currentStatus === 2) {
                console.log('Already authorized, navigating to app selection...');
                router.push('/select_apps');
                return;
              }
              
              // If not authorized (denied or not determined), request authorization
              // iOS will show the appropriate prompt or let user know they need to enable in Settings
              console.log('Requesting Family Controls authorization...');
              const authorized = await requestFamilyControlsAuthorization();
              console.log('Authorization result:', authorized);
              
              if (!authorized) {
                // User either denied or authorization failed
                // Show a helpful message
                Alert.alert(
                  'Screen Time Access Required',
                  'Screen Time permissions are required to create locks. Please grant access when prompted, or try reopening the app to see the prompt again.',
                  [{ text: 'OK' }]
                );
                return;
              }
              
              // Navigate to app selection screen
              console.log('Authorization granted, navigating to app selection...');
              router.push('/select_apps');
            } catch (e) {
              console.error('Create Lock flow error:', e);
              Alert.alert(
                'Error', 
                `Failed to start lock creation: ${e instanceof Error ? e.message : String(e)}`
              );
            }
          }}
        />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.welcomeText}>Welcome to Lock It!</Text>
      <Button 
        title="Sign In" 
        onPress={() => router.push('/signin')}
      />
      <Button 
        title="Sign Up" 
        onPress={() => router.push('/signup')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  spacer: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EDEDED',
    textAlign: 'center',
    marginBottom: 20,
  },
  userText: {
    fontSize: 16,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#A1A1AA',
    textAlign: 'center',
  },
  testSection: {
    width: '100%',
    padding: 15,
    marginVertical: 10,
    backgroundColor: '#1C1C1F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#66788C',
  },
  testTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EDEDED',
    textAlign: 'center',
    marginBottom: 8,
  },
  testStatus: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  pickerContainer: {
    height: 200,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#66788C',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerLabel: {
    fontSize: 14,
    color: '#EDEDED',
    marginBottom: 8,
    fontWeight: '600',
  },
  picker: {
    flex: 1,
  },
});
