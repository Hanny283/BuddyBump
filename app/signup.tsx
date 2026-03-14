import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import { Colors } from '../constants/theme';
import { signUp } from '../lib/firebase/auth';
import { useDeepLink, PENDING_INVITE_KEY } from '../lib/locks/DeepLinkProvider';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { hasPendingInvite } = useDeepLink();
  const [hasPendingInviteState, setHasPendingInviteState] = useState(false);

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

  const hasPending = hasPendingInvite || hasPendingInviteState;

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_KEY);
      const hasInvite = hasPending || !!pendingInvite;

      const message = hasInvite
        ? 'Account created successfully! You have a pending lock invite waiting for you.'
        : 'Account created successfully!';

      Alert.alert('Success', message, [
        {
          text: 'OK',
          onPress: () => {
            if (hasInvite) {
              router.replace('/(tabs)/your_locks');
            } else {
              router.replace('/(tabs)');
            }
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
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
          <View style={styles.logoSection}>
            <Ionicons name="lock-closed" size={48} color={Colors.blue} />
            <Text style={styles.logoLabel}>TIMESYNC</Text>
          </View>

          <Text style={styles.title}>Sign Up</Text>

          {hasPending && (
            <View style={styles.pendingInviteBanner}>
              <Text style={styles.pendingInviteText}>
                You have a pending lock invite! Sign up to accept it.
              </Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor={Colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <Button
            title={loading ? 'Creating Account...' : 'Sign Up'}
            onPress={handleSignUp}
            disabled={loading}
          />

          <TouchableOpacity style={styles.linkContainer} onPress={() => router.push('/signin')}>
            <Text style={styles.linkText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: Colors.textPrimary,
  },
  input: {
    backgroundColor: Colors.input,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
  },
  linkContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.blue,
    fontSize: 16,
  },
  pendingInviteBanner: {
    backgroundColor: Colors.warningBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.orange,
  },
  pendingInviteText: {
    color: Colors.orange,
    fontSize: 14,
    textAlign: 'center',
  },
});
