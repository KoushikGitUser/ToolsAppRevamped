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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { triggerToast } from '../Services/toast';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../Services/ThemeContext';
import { blurImage, setWallpaper } from '../modules/wallpaper-blur';

const ACCENT = '#00B4A6';
const ACCENT_LIGHT = '#26D4C8';

const SCREEN_WIDTH = Dimensions.get('window').width;

const TARGET_OPTIONS = [
  { label: 'Both', value: 0 },
  { label: 'Home Screen', value: 1 },
  { label: 'Lock Screen', value: 2 },
];

const ImageBlur = ({ navigation }) => {
  const [image, setImage] = useState(null);
  const [blurRadius, setBlurRadius] = useState(30);
  const [sliderValue, setSliderValue] = useState(30);
  const [previewUri, setPreviewUri] = useState(null);
  const [blurring, setBlurring] = useState(false);
  const [target, setTarget] = useState(0);
  const [applying, setApplying] = useState(false);
  const blurRequestRef = useRef(0);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent), [colors, accent]);

  const displayWidth = SCREEN_WIDTH - 40;
  const displayHeight = image
    ? Math.round((displayWidth / image.width) * image.height)
    : 240;
  const clampedHeight = Math.min(displayHeight, 500);

  // Auto-blur when image or blurRadius changes
  useEffect(() => {
    if (!image) return;
    const requestId = ++blurRequestRef.current;

    const doBlur = async () => {
      if (blurRadius === 0) {
        if (requestId === blurRequestRef.current) {
          setPreviewUri(image.uri);
          setBlurring(false);
        }
        return;
      }
      setBlurring(true);
      try {
        const result = await blurImage(image.uri, blurRadius);
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
  }, [image, blurRadius]);

  const pickingRef = useRef(false);
  const pickImage = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        triggerToast('Permission needed', 'Please grant gallery access to pick an image.', 'alert', 3000);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setImage(result.assets[0]);
        setPreviewUri(null);
      }
    } finally {
      pickingRef.current = false;
    }
  };

  const saveImage = async () => {
    if (!previewUri) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        triggerToast('Permission needed', 'Please grant storage access to save the image.', 'alert', 3000);
        return;
      }
      await MediaLibrary.saveToLibraryAsync(previewUri.replace(/^file:\/\//, ''));
      triggerToast('Saved', 'Image saved to your gallery.', 'success', 3000);
    } catch (error) {
      triggerToast('Error', 'Failed to save image.', 'error', 3000);
    }
  };

  const shareImage = async () => {
    if (!previewUri) return;
    await Sharing.shareAsync(previewUri, { mimeType: 'image/jpeg' });
  };

  const applyWallpaper = async () => {
    if (!previewUri) return;
    setApplying(true);
    try {
      await setWallpaper(previewUri, target);
      triggerToast('Success', 'Wallpaper applied successfully!', 'success', 3000);
    } catch (error) {
      console.log('Set wallpaper error:', error);
      triggerToast('Error', 'Failed to set wallpaper.', 'error', 3000);
    } finally {
      setApplying(false);
    }
  };

  const imageName = image
    ? (image.fileName || image.uri.split('/').pop() || 'image')
    : null;

  // Show the best available preview
  const displayUri = previewUri || image?.uri;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Image Blur</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Empty State */}
        {!image && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-image" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No image selected</Text>
            <Text style={styles.emptyDesc}>
              Pick an image from your gallery to apply a real pixel-level blur effect
            </Text>
          </View>
        )}

        {/* Image Preview (live updating) */}
        {image && (
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
            <Text style={styles.previewLabel} numberOfLines={1}>{imageName}</Text>
          </View>
        )}

        {/* Pick Image Button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickImage} activeOpacity={0.8} disabled={blurring}>
          <Ionicons name="image" size={22} color={colors.textPrimary} />
          <Text style={styles.pickBtnText}>{!image ? 'Pick Image' : 'Change Image'}</Text>
        </TouchableOpacity>

        {/* Blur Intensity Slider */}
        {image && (
          <View style={styles.sliderSection}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sliderTitle}>Blur Intensity</Text>
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
              disabled={blurring}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>None</Text>
              <Text style={styles.sliderLabel}>Extreme</Text>
            </View>
          </View>
        )}

        {/* Target Selection */}
        {image && previewUri && !blurring && (
          <View style={styles.targetSection}>
            <Text style={styles.targetTitle}>Set as Wallpaper</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.targetScroll}
            >
              {TARGET_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.targetChip,
                    target === opt.value && styles.targetChipActive,
                  ]}
                  onPress={() => setTarget(opt.value)}
                  activeOpacity={0.7}
                  disabled={applying}
                >
                  <Text style={[
                    styles.targetChipText,
                    target === opt.value && styles.targetChipTextActive,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Set Wallpaper Button */}
            <TouchableOpacity
              style={[styles.applyBtn, (applying || !previewUri) && styles.btnDisabled]}
              onPress={applyWallpaper}
              activeOpacity={0.8}
              disabled={applying || !previewUri}
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
          </View>
        )}

        {/* Save & Share */}
        {image && previewUri && !blurring && !applying && (
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
        )}
      </ScrollView>
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
    width: '100%',
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
  sliderTitle: {
    color: colors.qualityTitle,
    fontSize: 16,
    fontWeight: '600',
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

  // Target Selection
  targetSection: {
    marginTop: 24,
    width: '100%',
  },
  targetTitle: {
    color: colors.qualityTitle,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  targetScroll: {
    gap: 10,
    paddingRight: 4,
  },
  targetChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  targetChipActive: {
    backgroundColor: accent + '25',
    borderColor: accent,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  targetChipTextActive: {
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
    marginTop: 14,
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
    marginTop: 18,
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
});

export default ImageBlur;
