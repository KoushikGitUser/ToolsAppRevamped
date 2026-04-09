import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FFmpegKit, ReturnCode } from '@wokcito/ffmpeg-kit-react-native';
import { File } from 'expo-file-system';
import { triggerToast } from '../../Services/toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const VolumeAmplifier = ({ audioUri, colors, accent, isDark, onAmplified, disabled }) => {
  const [volumeGain, setVolumeGain] = useState(100);
  const [amplifying, setAmplifying] = useState(false);

  const gainFactor = volumeGain / 100;
  const gainDb = volumeGain === 100 ? 0 : (20 * Math.log10(gainFactor)).toFixed(1);

  const adjustVolume = (delta) => {
    setVolumeGain((prev) => {
      const next = prev + delta;
      return Math.max(10, Math.min(300, next));
    });
  };

  const amplify = async () => {
    if (!audioUri || volumeGain === 100) return;

    setAmplifying(true);
    try {
      const inputPath = audioUri.replace(/^file:\/\//, '');
      const ext = inputPath.split('.').pop() || 'm4a';
      const outputPath = inputPath.replace(`.${ext}`, `_amplified.${ext}`);

      // Clean up existing output
      const outputFile = new File(`file://${outputPath}`);
      if (outputFile.exists) {
        outputFile.delete();
      }

      // FFmpeg volume filter: volume=<gainFactor>
      const command = `-y -i "${inputPath}" -af "volume=${gainFactor}" -c:a aac -b:a 320k "${outputPath}"`;

      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        const resultUri = `file://${outputPath}`;
        onAmplified?.(resultUri);
        triggerToast('Success', `Volume set to ${volumeGain}%`, 'success', 2500);
      } else {
        const logs = await session.getLogsAsString();
        console.log('FFmpeg error:', logs);
        triggerToast('Error', 'Failed to amplify audio', 'error', 3000);
      }
    } catch (e) {
      console.log('Amplify error:', e);
      triggerToast('Error', 'Volume amplification failed', 'error', 3000);
    } finally {
      setAmplifying(false);
    }
  };

  const presets = [
    { label: '50%', value: 50 },
    { label: '100%', value: 100 },
    { label: '150%', value: 150 },
    { label: '200%', value: 200 },
  ];

  const styles = createStyles(colors, accent, isDark);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="volume-high" size={22} color={accent} />
        <Text style={styles.title}>Volume Amplifier</Text>
        <Text style={styles.gainBadge}>
          {volumeGain}% {volumeGain !== 100 ? `(${gainDb > 0 ? '+' : ''}${gainDb}dB)` : ''}
        </Text>
      </View>

      {/* Volume Control */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          style={styles.volumeBtn}
          onPress={() => adjustVolume(-10)}
          activeOpacity={0.7}
          disabled={disabled || amplifying}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.barContainer}>
          <View style={styles.barBg}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.min(100, (volumeGain / 300) * 100)}%`,
                  backgroundColor: volumeGain > 200 ? '#FF4444' : volumeGain > 100 ? '#FF8800' : accent,
                },
              ]}
            />
          </View>
          <View style={styles.markers}>
            <Text style={styles.markerText}>0%</Text>
            <Text style={styles.markerText}>100%</Text>
            <Text style={styles.markerText}>200%</Text>
            <Text style={styles.markerText}>300%</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.volumeBtn}
          onPress={() => adjustVolume(10)}
          activeOpacity={0.7}
          disabled={disabled || amplifying}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Presets */}
      <View style={styles.presets}>
        {presets.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.presetBtn, volumeGain === p.value && styles.presetBtnActive]}
            onPress={() => setVolumeGain(p.value)}
            activeOpacity={0.7}
            disabled={disabled || amplifying}
          >
            <Text style={[styles.presetText, volumeGain === p.value && styles.presetTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Amplify Button */}
      {volumeGain !== 100 && (
        <TouchableOpacity
          style={[styles.amplifyBtn, (disabled || amplifying) && { opacity: 0.5 }]}
          onPress={amplify}
          activeOpacity={0.8}
          disabled={disabled || amplifying}
        >
          {amplifying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="volume-high" size={20} color="#fff" />
          )}
          <Text style={styles.amplifyBtnText}>
            {amplifying ? 'Amplifying...' : `Apply ${volumeGain}% Volume`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (colors, accent, isDark) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginTop: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    title: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    gainBadge: {
      fontSize: 13,
      fontWeight: '700',
      color: accent,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    volumeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: accent + '20',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: accent + '40',
    },
    barContainer: {
      flex: 1,
    },
    barBg: {
      height: 8,
      backgroundColor: colors.border2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 4,
    },
    markers: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    markerText: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '500',
    },
    presets: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    },
    presetBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border2,
    },
    presetBtnActive: {
      backgroundColor: accent + '20',
      borderColor: accent,
    },
    presetText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    presetTextActive: {
      color: accent,
      fontWeight: '700',
    },
    amplifyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 14,
      marginTop: 14,
      gap: 8,
    },
    amplifyBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });

export default VolumeAmplifier;
