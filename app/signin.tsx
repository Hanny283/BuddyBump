import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Button from '../components/ui 2/Button';
import { signIn } from '../lib/firebase/auth';
import { useDeepLink, PENDING_INVITE_KEY } from '../lib/locks/DeepLinkProvider';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { hasPendingInvite } = useDeepLink();
  const [hasPendingInviteState, setHasPendingInviteState] = useState(false);

  // Check for pending invite on mount (fallback in case context hasn't updated yet)
  useEffect(() => {
    const checkPendingInvite = async () => {
      try {
        const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_KEY);
        setHasPendingInviteState(!!pendingInvite);
      } catch (error) {
        console.error('Error checking pending invite:', error);
      }
    };
    checkPendingInvite();
  }, []);

  // Use either context or local state
  const hasPending = hasPendingInvite || hasPendingInviteState;

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      // Check if there's a pending invite - if so, go to Your locks page
      // The DeepLinkProvider will automatically load the pending lock after login
      // Double-check AsyncStorage as fallback
      const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_KEY);
      const hasInvite = hasPending || !!pendingInvite;
      
      if (hasInvite) {
        router.replace('/(tabs)/your_locks');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
        <Text style={styles.title}>Sign In</Text>
        
        {hasPending && (
          <View style={styles.pendingInviteBanner}>
            <Text style={styles.pendingInviteText}>
              🔒 You have a pending lock invite! Sign in to accept it.
            </Text>
          </View>
        )}
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        
        <Button
          title={loading ? "Signing In..." : "Sign In"}
          onPress={handleSignIn}
          disabled={loading}
        />
        
        <TouchableOpacity 
          style={styles.linkContainer}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.linkText}>
            Don't have an account? Sign Up
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.linkContainer}
          onPress={() => router.back()}
        >
          <Text style={styles.linkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  linkContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  pendingInviteBanner: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  pendingInviteText: {
    color: '#1976D2',
    fontSize: 14,
    textAlign: 'center',
  },
});

