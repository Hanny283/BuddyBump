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
      // Handle web URLs: https://domain/lock/{inviteId}
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const match = url.match(/\/lock\/([a-f0-9]+)/i);
        if (match && match[1]) return match[1];
      }

      const parsed = Linking.parse(url);

      // Handle timesync://lock/{inviteId}
      // URL format: timesync://lock/{inviteId}
      if (parsed.scheme === 'timesync') {
        // Case 1: timesync://lock/{inviteId} - hostname is "lock", path is "/{inviteId}"
        if (parsed.hostname === 'lock') {
          if (parsed.path) {
            // Path should be "/{inviteId}" or "{inviteId}"
            const pathParts = parsed.path.split('/').filter(Boolean);
            if (pathParts.length > 0) {
              return pathParts[0];
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
            return pathParts[1];
          }
          // If path is just /{inviteId} (when hostname might be null/empty)
          if (pathParts.length === 1 && pathParts[0]) {
            return pathParts[0];
          }
        }

        // Case 3: Query parameter format timesync://?inviteId=...
        if (parsed.queryParams && parsed.queryParams.inviteId) {
          return parsed.queryParams.inviteId as string;
        }
      }

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
      const inviteId = extractInviteIdFromUrl(url);
      if (inviteId) {
        await storePendingInvite(inviteId);
        // If user is logged in, load the lock immediately
        if (user) {
          const lock = await getLockByInviteId(inviteId);
          if (lock) {
            setPendingLock(lock);
          }
        }
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
          setPendingInvite(storedInviteId);
          // If user is logged in, load the lock immediately
          if (user) {
            const lock = await getLockByInviteId(storedInviteId);
            if (lock) {
              setPendingLock(lock);
            }
          }
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
        if (initialUrl) {
          await handleUrl(initialUrl);
        }
      } catch (error) {
        console.error('Error handling initial URL:', error);
      }
    };

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
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
      loadPendingLock(pendingInvite);
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
