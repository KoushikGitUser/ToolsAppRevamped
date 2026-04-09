import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
  Modal,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { triggerToast } from '../Services/toast';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../Services/ThemeContext';
import { getWallpaper, blurImage, setWallpaper } from '../modules/wallpaper-blur';

const ACCENT = '#009688';
const ACCENT_LIGHT = '#26D4C8';
const SCREEN_WIDTH = Dimensions.get('window').width;


const TARGET_OPTIONS = [
  { label: 'Both', value: 0 },
  { label: 'Home Screen', value: 1 },
  { label: 'Lock Screen', value: 2 },
];

const WallpaperBlur = ({ navigation }) => {
  const [wallpaper, setWallpaperState] = useState(null);
  const [blurRadius, setBlurRadius] = useState(30);
  const [sliderValue, setSliderValue] = useState(30);
  const [previewUri, setPreviewUri] = useState(null);
  const [target, setTarget] = useState(0);
  const [blurring, setBlurring] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [unavailableModal, setUnavailableModal] = useState(false);
  const blurRequestRef = useRef(0);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent), [colors, accent]);

  const busy = fetching || blurring || applying;

  const displayWidth = SCREEN_WIDTH - 40;
  const displayHeight = wallpaper
    ? Math.round((displayWidth / wallpaper.width) * wallpaper.height)
    : 240;
  const clampedHeight = Math.min(displayHeight, 500);

  // Auto-blur when wallpaper or blurRadius changes
  useEffect(() => {
    if (!wallpaper) return;
    const requestId = ++blurRequestRef.current;

    const doBlur = async () => {
      if (blurRadius === 0) {
        if (requestId === blurRequestRef.current) {
          setPreviewUri(wallpaper.uri);
          setBlurring(false);
        }
        return;
      }
      setBlurring(true);
      try {
        const result = await blurImage(wallpaper.uri, blurRadius);
        if (requestId === blurRequestRef.current) {
          setPreviewUri(result.uri);
        }
      } catch (error) {
        console.log('Blur error:', error);
        if (requestId === blurRequestRef.current) {
          triggerToast('Error', 'Failed to apply blur.', 'error', 3000);
        }
      } finally {
        if (requestId === blurRequestRef.current) {
          setBlurring(false);
        }
      }
    };

    doBlur();
  }, [wallpaper, blurRadius]);

  const requestPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const sdkInt = Platform.Version;
    if (sdkInt >= 33) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: 'Storage Permission',
        message: 'This app needs storage access to read your wallpaper.',
        buttonPositive: 'Allow',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const fetchWallpaper = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      triggerToast('Permission Denied', 'Storage permission is required to read wallpaper.', 'alert', 3000);
      return;
    }
    setFetching(true);
    try {
      const info = await getWallpaper();
      setWallpaperState(info);
      setPreviewUri(null);
      setApplied(false);
    } catch (error) {
      console.log('Wallpaper fetch error:', error);
      triggerToast('Error', error.message || 'Failed to get wallpaper.', 'error', 3000);
    } finally {
      setFetching(false);
    }
  };

  const applyWallpaper = async () => {
    if (!previewUri) return;
    setApplying(true);
    try {
      await setWallpaper(previewUri, target);
      setApplied(true);
      triggerToast('Success', 'Wallpaper applied successfully!', 'success', 3000);
    } catch (error) {
      console.log('Set wallpaper error:', error);
      triggerToast('Error', 'Failed to set wallpaper.', 'error', 3000);
    } finally {
      setApplying(false);
    }
  };

  const saveImage = async () => {
    const uri = previewUri || wallpaper?.uri;
    if (!uri) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        triggerToast('Permission needed', 'Please grant storage access to save the image.', 'alert', 3000);
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri.replace(/^file:\/\//, ''));
      triggerToast('Saved', 'Wallpaper saved to your gallery.', 'success', 3000);
    } catch (error) {
      console.log('Save error:', error);
      triggerToast('Error', 'Failed to save image.', 'error', 3000);
    }
  };

  const shareImage = async () => {
    const uri = previewUri || wallpaper?.uri;
    if (!uri) return;
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission Denied', 'Gallery access is required.', 'alert', 3000);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setWallpaperState({ uri: asset.uri, width: asset.width, height: asset.height });
    setPreviewUri(null);
    setApplied(false);
  };

  const resetAll = () => {
    setWallpaperState(null);
    setPreviewUri(null);
    setApplied(false);
    setBlurRadius(30);
    setSliderValue(30);
    setTarget(0);
  };

  const displayUri = previewUri || wallpaper?.uri;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={busy}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Wallpaper Blur</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Empty State */}
        {!wallpaper && !fetching && (
          <View style={styles.emptyState}>
            <Ionicons name="phone-portrait-outline" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No wallpaper loaded</Text>
            <Text style={styles.emptyDesc}>
              Fetch your current wallpaper to apply a real pixel-level blur effect
            </Text>
          </View>
        )}

        {/* Fetching indicator */}
        {fetching && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.emptyTitle, { marginTop: 16 }]}>Fetching wallpaper...</Text>
          </View>
        )}

        {/* Live Preview (updates in real-time) */}
        {wallpaper && !fetching && !applied && (
          <View style={styles.previewContainer}>
            <View style={{ position: 'relative' }}>
              <Image
                source={{ uri: displayUri }}
                style={[styles.previewImage, { width: displayWidth, height: clampedHeight }]}
                resizeMode="cover"
              />
              {blurring && (
                <View style={styles.blurOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.previewLabel}>
              {wallpaper.width} x {wallpaper.height} px
            </Text>
          </View>
        )}

        {/* Fetch Wallpaper Button */}
        {!applied && Platform.OS === 'android' && (
          <TouchableOpacity
            style={[styles.pickBtn, Platform.Version >= 33 && { opacity: 0.45 }]}
            onPress={Platform.Version >= 33 ? () => setUnavailableModal(true) : fetchWallpaper}
            activeOpacity={0.8}
            disabled={busy}
          >
            <Ionicons name="phone-portrait-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>
              {!wallpaper ? 'Fetch Current Wallpaper' : 'Refresh Wallpaper'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Pick from Gallery Button — always shown, required on Android 13+ */}


        {/* Blur Presets + Target + Actions (shown when wallpaper loaded, not applied yet) */}
        {wallpaper && !fetching && !applied && (
          <>
            {/* Blur Intensity Slider */}
            <View style={styles.sliderSection}>
              <View style={styles.sliderHeader}>
                <Text style={styles.presetTitle}>Blur Intensity</Text>
                <Text style={styles.sliderValue}>{sliderValue}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={120}
                step={1}
                value={blurRadius}
                onValueChange={(val) => setSliderValue(Math.round(val))}
                onSlidingComplete={(val) => {
                  const rounded = Math.round(val);
                  setSliderValue(rounded);
                  setBlurRadius(rounded);
                }}
                minimumTrackTintColor={accent}
                maximumTrackTintColor={colors.pickBorder}
                thumbTintColor={accent}
                disabled={busy}
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>None</Text>
                <Text style={styles.sliderLabel}>Extreme</Text>
              </View>
            </View>

            {/* Target Selection */}
            <View style={styles.presetSection}>
              <Text style={styles.presetTitle}>Apply To</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetScroll}
              >
                {TARGET_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.presetChip,
                      target === opt.value && styles.presetChipActive,
                    ]}
                    onPress={() => setTarget(opt.value)}
                    activeOpacity={0.7}
                    disabled={busy}
                  >
                    <Text style={[
                      styles.presetChipText,
                      target === opt.value && styles.presetChipTextActive,
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Set Wallpaper Button */}
            <TouchableOpacity
              style={[styles.applyBtn, (busy || !previewUri) && styles.btnDisabled]}
              onPress={applyWallpaper}
              activeOpacity={0.8}
              disabled={busy || !previewUri}
            >
              {applying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
              )}
              <Text style={styles.applyBtnText}>
                {applying ? 'Setting Wallpaper...' : 'Set as Wallpaper'}
              </Text>
            </TouchableOpacity>

            {/* Save & Share */}
            {previewUri && !blurring && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.saveBtn} onPress={saveImage} activeOpacity={0.8} disabled={busy}>
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={shareImage} activeOpacity={0.8} disabled={busy}>
                  <Ionicons name="share" size={20} color={colors.shareBtnText} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Success State */}
        {applied && (
          <View style={styles.resultSection}>
            <View style={styles.resultCard}>
              <View style={[styles.resultIconCircle, { backgroundColor: accent + '20' }]}>
                <Ionicons name="phone-portrait-outline" size={36} color={accent} />
              </View>
            </View>

            <View style={[styles.successBadge, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
              <Ionicons name="checkmark-circle" size={28} color={accent} />
              <Text style={[styles.successText, { color: accent }]}>Wallpaper Applied!</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveImage} activeOpacity={0.8}>
                <Ionicons name="download" size={20} color={colors.saveBtnText} />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareImage} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={resetAll}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Blur Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Android 13+ Unavailable Modal */}
      <Modal
        visible={unavailableModal}
        transparent
        animationType="fade"
        onRequestClose={() => setUnavailableModal(false)}
      >
        <View style={styles.unavailOverlay}>
          <View style={styles.unavailBox}>
            <MaterialCommunityIcons name="lock-outline" size={40} color={accent} style={{ marginBottom: 14 }} />
            <Text style={styles.unavailTitle}>Not Available on Android 13+</Text>
            <Text style={styles.unavailBody}>
              Starting with Android 13, Google restricted wallpaper access for third-party apps. Reading the current wallpaper requires a system-level permission that cannot be granted to regular apps.{'\n\n'}Use <Text style={{ fontWeight: '700', color: colors.textPrimary }}>"Pick from Gallery"</Text> instead — take a screenshot of your home screen and select it.
            </Text>
            <TouchableOpacity
              style={styles.unavailBtn}
              onPress={() => setUnavailableModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.unavailBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors, accent) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  backBtn: { marginRight: 12 },
  heading: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    alignItems: 'center',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 20,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 20,
  },

  // Preview
  previewContainer: {
    marginTop: 16,
    alignItems: 'center',
    width: '100%',
  },
  previewImage: {
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pick Button
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pickBg,
    borderWidth: 2,
    borderColor: colors.pickBorder,
    borderStyle: 'dashed',
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 16,
    gap: 10,
    width: '100%',
  },
  pickBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Slider
  sliderSection: {
    marginTop: 24,
    width: '100%',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetTitle: {
    color: colors.qualityTitle,
    fontSize: 16,
    fontWeight: '600',
    marginBottom:20
  },
  sliderValue: {
    color: accent,
    fontSize: 18,
    fontWeight: '800',
  },
  slider: {
    width: '100%',
    height: 50,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  // Target Presets
  presetSection: {
    marginTop: 24,
    width: '100%',
  },
  presetScroll: {
    gap: 10,
    paddingRight: 4,
  },
  presetChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  presetChipActive: {
    backgroundColor: accent + '25',
    borderColor: accent,
  },
  presetChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: accent,
  },

  // Apply Button
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 18,
    gap: 10,
    width: '100%',
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    width: '100%',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.saveBtnBg,
    borderRadius: 60,
    paddingVertical: 16,
    gap: 10,
  },
  saveBtnText: {
    color: colors.saveBtnText,
    fontSize: 16,
    fontWeight: '700',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shareBtnBg,
    borderRadius: 60,
    paddingVertical: 16,
    gap: 10,
  },
  shareBtnText: {
    color: colors.shareBtnText,
    fontSize: 16,
    fontWeight: '700',
  },

  // Retry
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.retryBg,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 12,
    gap: 10,
    width: '100%',
  },
  retryBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Result Section
  resultSection: {
    marginTop: 20,
    width: '100%',
  },
  resultCard: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 14,
  },
  resultIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 60,
    borderWidth: 1,
    paddingVertical: 14,
    gap: 10,
  },
  successText: {
    fontSize: 16,
    fontWeight: '700',
  },
  unavailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  unavailBox: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  unavailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  unavailBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  unavailBtn: {
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  unavailBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default WallpaperBlur;
