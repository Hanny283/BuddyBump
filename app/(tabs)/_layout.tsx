import { Tabs } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../../lib/firebase/AuthContext';
import { db } from '../../lib/firebase/config';
import { blockLock, startMonitoringForCreator } from '../../lib/locks/service';
import { onDeviceActivityMonitorEvent } from '../../lib/screentime';

export default function TabsLayout() {
  const { user } = useAuth();

  // Listen for locks created by this user becoming active and start monitoring
  // This runs at the tabs level so it only sets up once, avoiding infinite loops
  useEffect(() => {
    if (Platform.OS !== 'ios' || !user?.uid) return;

    console.log('👂 Setting up lock listener for user:', user.uid);
    console.log('🔍 Watching for locks with status=active and creatorUserId=', user.uid);

    const q = query(
      collection(db, 'locks'),
      where('creatorUserId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const changeCount = snapshot.docChanges().length;
      console.log(`📬 Lock snapshot received, ${changeCount} change(s)`);
      
      if (changeCount === 0) {
        console.log('ℹ️ No changes detected (initial empty snapshot or no new changes)');
        return;
      }
      
      for (const change of snapshot.docChanges()) {
        const lockData = change.doc.data();
        console.log(`📝 Change detected:
  - Type: ${change.type}
  - Lock ID: ${change.doc.id}
  - Status: ${lockData.status}
  - Creator: ${lockData.creatorUserId}
  - Holder: ${lockData.holderUserId}
  - Minutes: ${lockData.dailyMinutes}`);
        
        if (change.type === 'added' || change.type === 'modified') {
          const lockId = change.doc.id;
          console.log(`🚨 LOCK BECAME ACTIVE - Starting monitoring for lock: ${lockId}`);
          
          try {
            await startMonitoringForCreator(lockId);
            console.log('✅ Monitoring successfully started for creator');
          } catch (error) {
            console.error('❌ Failed to start monitoring:', error);
          }
        }
      }
    }, (error) => {
      console.error('❌ Error in lock listener:', error);
    });

    return () => {
      console.log('🔕 Cleaning up lock listener');
      unsubscribe();
    };
  }, [user?.uid]);

  // Listen for Device Activity Monitor events (when time threshold is reached)
  useEffect(() => {
    if (Platform.OS !== 'ios' || !user?.uid) return;

    console.log('📡 Setting up Device Activity Monitor event listener');

    const handleMonitorEvent = async (event: any) => {
      console.log('📡📡📡 DEVICE ACTIVITY MONITOR EVENT RECEIVED:', JSON.stringify(event, null, 2));
      
      // Only handle threshold events
      if (event.callbackName !== 'eventDidReachThreshold') {
        console.log('ℹ️ Ignoring non-threshold event:', event.callbackName);
        return;
      }
      
      console.log('⏰⏰⏰ TIME THRESHOLD REACHED!');
      console.log('Event details:', event);
      
      // Extract lock ID from event name or activity name
      // The event might have: event.eventName, event.activityName, or event.id
      const eventIdentifier = event.eventName || event.activityName || event.id || '';
      console.log('Event identifier:', eventIdentifier);
      
      const lockIdMatch = eventIdentifier.match(/lock_([^_]+)/);
      
      if (lockIdMatch && lockIdMatch[1]) {
        const lockId = lockIdMatch[1];
        console.log('🔒 TIME IS UP FOR LOCK:', lockId);
        console.log('🛡️ Shield screen should now be visible to the user');
        
        try {
          await blockLock(lockId);
          console.log('✅ Lock marked as blocked in Firestore');
        } catch (error) {
          console.error('❌ Failed to update lock status:', error);
        }
      } else {
        // If we can't find lock ID, just find all active locks for this user
        console.warn('⚠️ Could not extract lock ID from event, checking all active locks');
        console.log('Full event object:', event);
        
        try {
          const { listLocksForCreator } = await import('../../lib/locks/service');
          const locks = await listLocksForCreator(user.uid);
          const activeLocks = locks.filter(l => l.status === 'active' && !l.isBlocked);
          
          if (activeLocks.length > 0) {
            console.log(`Found ${activeLocks.length} active lock(s), marking as blocked`);
            for (const lock of activeLocks) {
              try {
                await blockLock(lock.id);
                console.log(`✅ Blocked lock: ${lock.id}`);
              } catch (err) {
                console.error(`Failed to block lock ${lock.id}:`, err);
              }
            }
          }
        } catch (error) {
          console.error('Failed to find and block locks:', error);
        }
      }
    };
    
    const subscription = onDeviceActivityMonitorEvent(handleMonitorEvent);
    
    return () => {
      console.log('📡 Cleaning up Device Activity Monitor listener');
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [user?.uid]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#0B0B0F' },
        headerTintColor: '#EDEDED',
        tabBarActiveTintColor: '#EDEDED',
        tabBarInactiveTintColor: '#A1A1AA',
        tabBarLabelStyle: { fontSize: 12 },
        tabBarStyle: { 
          paddingBottom: Platform.OS === 'ios' ? 10 : 6, 
          height: 60,
          backgroundColor: '#0B0B0F',
          borderTopColor: '#27272A'
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home' }}
      />
      <Tabs.Screen
        name="your_locks"
        options={{ title: 'Your Locks' }}
      />
    </Tabs>
  );
}


