import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import {
  hasFlash,
  turnOn,
  turnOff,
  isOn as getIsOn,
  getMaxBrightness,
  setBrightness,
} from '../modules/flashlight-tools';

const ACCENT = '#FF9800';
const ACCENT_LIGHT = '#F57C00';

const Flashlight = ({ navigation }) => {
  const [flashOn, setFlashOn] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(true);
  const [maxBrightness, setMaxBrightness] = useState(0);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [sliderValue, setSliderValue] = useState(1);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  useEffect(() => {
    try {
      const available = hasFlash();
      setFlashAvailable(available);
      if (available) {
        const max = getMaxBrightness();
        setMaxBrightness(max);
        if (max > 0) {
          setBrightnessLevel(max);
          setSliderValue(max);
        }
      }
    } catch {
      setFlashAvailable(false);
    }

    // Turn off flash when leaving page
    return () => {
      try { turnOff(); } catch {}
    };
  }, []);

  const toggleFlash = () => {
    if (!flashAvailable) {
      triggerToast('Not Available', 'No flashlight on this device', 'alert', 2500);
      return;
    }

    try {
      if (flashOn) {
        turnOff();
        setFlashOn(false);
      } else {
        if (maxBrightness > 0) {
          setBrightness(brightnessLevel);
        } else {
          turnOn();
        }
        setFlashOn(true);
      }
    } catch (e) {
      triggerToast('Error', e.message || 'Failed to toggle flashlight', 'error', 2500);
    }
  };

  const handleBrightnessChange = (value) => {
    const level = Math.round(value);
    setBrightnessLevel(level);
    setSliderValue(level);
    if (flashOn) {
      try {
        setBrightness(level);
      } catch {}
    }
  };

  const brightnessPercent = maxBrightness > 0
    ? Math.round((brightnessLevel / maxBrightness) * 100)
    : 100;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Flashlight</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Flash Toggle */}
        <View style={styles.toggleSection}>
          <TouchableOpacity
            style={[styles.toggleBtn, flashOn && styles.toggleBtnActive]}
            onPress={toggleFlash}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleIconBg, flashOn && styles.toggleIconBgActive]}>
              <MaterialCommunityIcons
                name={flashOn ? 'flashlight' : 'flashlight-off'}
                size={64}
                color={flashOn ? '#fff' : colors.textMuted}
              />
            </View>
            <Text style={[styles.toggleLabel, flashOn && styles.toggleLabelActive]}>
              {flashOn ? 'ON' : 'OFF'}
            </Text>
            <Text style={styles.toggleHint}>Tap to {flashOn ? 'turn off' : 'turn on'}</Text>
          </TouchableOpacity>
        </View>

        {/* Brightness Control */}
        {maxBrightness > 0 && (
          <View style={styles.brightnessSection}>
            <View style={styles.brightnessHeader}>
              <Text style={styles.brightnessTitle}>Brightness</Text>
              <Text style={[styles.brightnessValue, { color: accent }]}>{brightnessPercent}%</Text>
            </View>

            <View style={styles.sliderRow}>
              <MaterialCommunityIcons name="brightness-5" size={18} color={colors.textMuted} />
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={maxBrightness}
                step={1}
                value={sliderValue}
                onValueChange={setSliderValue}
                onSlidingComplete={handleBrightnessChange}
                minimumTrackTintColor={accent}
                maximumTrackTintColor={isDark ? '#444' : '#ddd'}
                thumbTintColor={accent}
              />
              <MaterialCommunityIcons name="brightness-7" size={22} color={accent} />
            </View>

            <Text style={styles.brightnessInfo}>
              Brightness control available on this device ({maxBrightness} levels)
            </Text>
          </View>
        )}

        {maxBrightness === 0 && (
          <View style={styles.brightnessSection}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.infoText}>
                Brightness control is not available on this device. Only on/off is supported.
              </Text>
            </View>
          </View>
        )}

        {!flashAvailable && (
          <View style={styles.brightnessSection}>
            <View style={[styles.infoBox, { borderColor: '#ff4444' }]}>
              <Ionicons name="warning-outline" size={20} color="#ff4444" />
              <Text style={[styles.infoText, { color: '#ff4444' }]}>
                No flashlight hardware detected on this device.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (colors, accent, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    backBtn: { marginRight: 12 },
    heading: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

    // Toggle Section
    toggleSection: {
      alignItems: 'center',
      marginTop: 40,
      marginBottom: 40,
    },
    toggleBtn: {
      alignItems: 'center',
      padding: 30,
      borderRadius: 30,
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderWidth: 2,
      borderColor: isDark ? '#333' : '#e0e0e0',
      width: '100%',
    },
    toggleBtnActive: {
      backgroundColor: accent + '15',
      borderColor: accent,
    },
    toggleIconBg: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    toggleIconBgActive: {
      backgroundColor: accent,
    },
    toggleLabel: {
      fontSize: 32,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 4,
    },
    toggleLabelActive: {
      color: accent,
    },
    toggleHint: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 8,
    },

    // Brightness
    brightnessSection: {
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
      marginBottom: 16,
    },
    brightnessHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    brightnessTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    brightnessValue: {
      fontSize: 18,
      fontWeight: '800',
    },
    sliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    slider: {
      flex: 1,
      height: 40,
    },
    brightnessInfo: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 8,
      textAlign: 'center',
    },

    // Info
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 4,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });

export default Flashlight;
