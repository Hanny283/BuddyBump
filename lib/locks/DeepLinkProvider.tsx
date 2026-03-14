import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLockByInviteId } from './service';
import { Lock } from './types';
import { useAuth } from '../firebase/AuthContext';

export const PENDING_INVITE_KEY = 'pending_lock_invite_id';

interface DeepLinkContextType {
  pendingInvite: string | null;
  pendingLock: Lock | null;
  hasPendingInvite: boolean;
  storePendingInvite: (inviteId: string) => Promise<void>;
  clearPendingInvite: () => Promise<void>;
  loadPendingLock: (inviteId: string) => Promise<Lock | null>;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  pendingInvite: null,
  pendingLock: null,
  hasPendingInvite: false,
  storePendingInvite: async () => {},
  clearPendingInvite: async () => {},
  loadPendingLock: async () => null,
});

export const useDeepLink = () => {
  const context = useContext(DeepLinkContext);
  if (!context) {
    throw new Error('useDeepLink must be used within DeepLinkProvider');
  }
  return context;
};

export const DeepLinkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [pendingLock, setPendingLock] = useState<Lock | null>(null);

  // Handle URL parsing and invite extraction
  const extractInviteIdFromUrl = (url: string): string | null => {
    try {
      console.log('Parsing URL:', url);
      const parsed = Linking.parse(url);
      console.log('Parsed URL:', JSON.stringify(parsed, null, 2));
      
      // Handle timesync://lock/{inviteId}
      // URL format: timesync://lock/{inviteId}
      if (parsed.scheme === 'timesync') {
        // Case 1: timesync://lock/{inviteId} - hostname is "lock", path is "/{inviteId}"
        if (parsed.hostname === 'lock') {
          if (parsed.path) {
            // Path should be "/{inviteId}" or "{inviteId}"
            const pathParts = parsed.path.split('/').filter(Boolean);
            if (pathParts.length > 0) {
              const inviteId = pathParts[0];
              console.log('Extracted inviteId from hostname=lock:', inviteId);
              return inviteId;
            }
          }
          // If no path but hostname is lock, might be timesync://lock?inviteId=...
          if (parsed.queryParams && parsed.queryParams.inviteId) {
            return parsed.queryParams.inviteId as string;
          }
        }
        
        // Case 2: timesync:///lock/{inviteId} or timesync:///{inviteId} (no hostname)
        if (parsed.path) {
          const pathParts = parsed.path.split('/').filter(Boolean);
          // If path is /lock/{inviteId}
          if (pathParts[0] === 'lock' && pathParts[1]) {
            console.log('Extracted inviteId from path /lock/{id}:', pathParts[1]);
            return pathParts[1];
          }
          // If path is just /{inviteId} (when hostname might be null/empty)
          if (pathParts.length === 1 && pathParts[0]) {
            console.log('Extracted inviteId from path /{id}:', pathParts[0]);
            return pathParts[0];
          }
        }
        
        // Case 3: Query parameter format timesync://?inviteId=...
        if (parsed.queryParams && parsed.queryParams.inviteId) {
          console.log('Extracted inviteId from query params:', parsed.queryParams.inviteId);
          return parsed.queryParams.inviteId as string;
        }
      }
      
      console.log('No inviteId found in URL');
      return null;
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  };

  const storePendingInvite = React.useCallback(async (inviteId: string) => {
    try {
      await AsyncStorage.setItem(PENDING_INVITE_KEY, inviteId);
      setPendingInvite(inviteId);
    } catch (error) {
      console.error('Error storing pending invite:', error);
    }
  }, []);

  const handleUrl = React.useCallback(async (url: string) => {
    try {
      console.log('Handling URL:', url);
      const inviteId = extractInviteIdFromUrl(url);
      if (inviteId) {
        console.log('Found inviteId:', inviteId);
        await storePendingInvite(inviteId);
        // If user is logged in, load the lock immediately
        if (user) {
          console.log('User is logged in, loading lock...');
          const lock = await getLockByInviteId(inviteId);
          if (lock) {
            console.log('Lock loaded:', lock.id);
            setPendingLock(lock);
          } else {
            console.log('Lock not found for inviteId:', inviteId);
          }
        } else {
          console.log('User not logged in, invite stored for later');
        }
      } else {
        console.log('No inviteId extracted from URL');
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  }, [user, storePendingInvite]);

  useEffect(() => {
    // Check for pending invite in storage (from before login)
    const loadStoredInvite = async () => {
      try {
        const storedInviteId = await AsyncStorage.getItem(PENDING_INVITE_KEY);
        if (storedInviteId) {
          console.log('Found stored invite ID:', storedInviteId);
          setPendingInvite(storedInviteId);
          // If user is logged in, load the lock immediately
          if (user) {
            console.log('User is logged in, loading lock from stored invite...');
            const lock = await getLockByInviteId(storedInviteId);
            if (lock) {
              console.log('Lock loaded from stored invite:', lock.id);
              setPendingLock(lock);
            } else {
              console.log('Lock not found for stored invite ID:', storedInviteId);
            }
          } else {
            console.log('User not logged in yet, invite will be loaded after login');
          }
        } else {
          console.log('No stored invite found');
        }
      } catch (error) {
        console.error('Error loading stored invite:', error);
      }
    };

    loadStoredInvite();
  }, [user]);

  useEffect(() => {
    // Handle deep link when app opens
    const handleInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('Initial URL:', initialUrl);
        if (initialUrl) {
          await handleUrl(initialUrl);
        }
      } catch (error) {
        console.error('Error handling initial URL:', error);
      }
    };

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event received:', event.url);
      handleUrl(event.url);
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, [user, handleUrl]);


  const clearPendingInvite = async () => {
    try {
      await AsyncStorage.removeItem(PENDING_INVITE_KEY);
      setPendingInvite(null);
      setPendingLock(null);
    } catch (error) {
      console.error('Error clearing pending invite:', error);
    }
  };

  const loadPendingLock = async (inviteId: string): Promise<Lock | null> => {
    try {
      const lock = await getLockByInviteId(inviteId);
      if (lock) {
        setPendingLock(lock);
      }
      return lock;
    } catch (error) {
      console.error('Error loading pending lock:', error);
      return null;
    }
  };

  // When user logs in, check for pending invite and load lock
  useEffect(() => {
    if (user && pendingInvite && !pendingLock) {
      console.log('User logged in with pending invite, loading lock...');
      loadPendingLock(pendingInvite).then((lock) => {
        if (lock) {
          console.log('Lock loaded after login:', lock.id);
        } else {
          console.log('Failed to load lock after login for invite:', pendingInvite);
        }
      });
    }
  }, [user, pendingInvite, pendingLock]);

  const value = {
    pendingInvite,
    pendingLock,
    hasPendingInvite: !!pendingInvite,
    storePendingInvite,
    clearPendingInvite,
    loadPendingLock,
  };

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
};

