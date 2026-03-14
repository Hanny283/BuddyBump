import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useAuth } from '../lib/firebase/AuthContext';
import { createLockDraft } from '../lib/locks/service';
import { DeviceActivitySelectionView } from '../lib/screentime';

const QUICK_PRESETS = [15, 30, 60, 120];

const STEPS = ['1  Apps', '2  Limit', '3  Share'];

export default function SelectAppsScreen() {
  const { user } = useAuth();
  const [appSelection, setAppSelection] = useState<string | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in to create a lock.');
      return;
    }

    if (!appSelection) {
      Alert.alert('No Apps Selected', 'Please tap the app picker and select at least one app to restrict.');
      return;
    }

    if (dailyMinutes < 1 || dailyMinutes > 1440) {
      Alert.alert('Invalid Limit', 'Daily limit must be between 1 and 1440 minutes.');
      return;
    }

    setCreating(true);
    try {
      const lock = await createLockDraft({
        appTokens: [appSelection],
        dailyMinutes,
        creatorUserId: user.uid,
      });

      await Share.share({
        message: `I'm setting up a Screen Time lock for myself. Accept it here: ${lock.inviteUrl}`,
        url: lock.inviteUrl,
      });

      router.replace('/(tabs)/your_locks');
    } catch (error) {
      if (__DEV__) console.error('Create lock error:', error);
      Alert.alert('Error', `Failed to create lock: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  };

  const currentStep = appSelection ? (dailyMinutes > 0 ? 2 : 1) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.blue} />
          </TouchableOpacity>
          <Text style={styles.title}>Create Lock</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Step indicator */}
        <View style={styles.stepsRow}>
          {STEPS.map((label, i) => (
            <View
              key={i}
              style={[styles.stepPill, i <= currentStep && styles.stepPillActive]}
            >
              <Text style={[styles.stepText, i <= currentStep && styles.stepTextActive]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.label}>Select Apps to Restrict</Text>
        <Text style={styles.hint}>Tap the picker below to choose which apps will be limited.</Text>

        {Platform.OS === 'ios' ? (
          <View style={styles.pickerContainer}>
            <DeviceActivitySelectionView
              onSelectionChange={(event) => {
                setAppSelection(event.nativeEvent.familyActivitySelection);
              }}
              familyActivitySelection={appSelection}
              style={styles.picker}
            />
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <Text style={styles.platformNote}>App selection requires iOS.</Text>
          </View>
        )}

        {appSelection ? (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.successText} />
            <Text style={styles.selectedBadgeText}> Apps selected</Text>
          </View>
        ) : (
          <Text style={styles.appPickerHint}>Tap to select apps</Text>
        )}

        <Text style={styles.label}>Daily Limit</Text>

        {/* Stepper */}
        <View style={styles.stepperRow}>
          <TouchableOpacity
            onPress={() => setDailyMinutes(m => Math.max(1, m - 1))}
            disabled={dailyMinutes <= 1}
            style={styles.stepperBtn}
          >
            <Ionicons
              name="remove-circle-outline"
              size={32}
              color={dailyMinutes <= 1 ? Colors.textMuted : Colors.blue}
            />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={String(dailyMinutes)}
            onChangeText={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n)) setDailyMinutes(Math.min(1440, Math.max(1, n)));
            }}
            keyboardType="number-pad"
            maxLength={4}
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={styles.minLabel}>min</Text>
          <TouchableOpacity
            onPress={() => setDailyMinutes(m => Math.min(1440, m + 1))}
            disabled={dailyMinutes >= 1440}
            style={styles.stepperBtn}
          >
            <Ionicons
              name="add-circle-outline"
              size={32}
              color={dailyMinutes >= 1440 ? Colors.textMuted : Colors.blue}
            />
          </TouchableOpacity>
        </View>

        {/* Quick presets */}
        <View style={styles.presetsRow}>
          {QUICK_PRESETS.map((min) => (
            <TouchableOpacity
              key={min}
              style={[styles.presetChip, dailyMinutes === min && styles.presetChipActive]}
              onPress={() => setDailyMinutes(min)}
            >
              <Text style={[styles.presetText, dailyMinutes === min && styles.presetTextActive]}>
                {min < 60 ? `${min} min` : `${min / 60} hr`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.hint}>
          Selected apps will be blocked after this many minutes each day. Resets at midnight.
        </Text>

        <Button
          title={creating ? 'Creating…' : 'Create & Share'}
          leftIcon="share-outline"
          onPress={handleCreate}
          disabled={creating || !appSelection}
        />

        <Text style={styles.shareNote}>
          You'll share a link. The other person taps it to hold your lock.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: {
    padding: 4,
  },
  headerSpacer: {
    width: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepPillActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  stepTextActive: {
    color: '#FFFFFF',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: -8,
  },
  pickerContainer: {
    height: 220,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  picker: {
    flex: 1,
    width: '100%',
  },
  platformNote: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: -8,
  },
  selectedBadgeText: {
    fontSize: 13,
    color: Colors.successText,
    fontWeight: '600',
  },
  appPickerHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: -8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    padding: 4,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: 'center',
    minWidth: 72,
  },
  minLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: -4,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  presetTextActive: {
    color: '#FFFFFF',
  },
  shareNote: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -4,
  },
});
