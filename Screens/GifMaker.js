import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
  PermissionsAndroid,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ImageViewing from 'react-native-image-viewing';
import Slider from '@react-native-community/slider';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { Paths } from 'expo-file-system';
import { createGif, videoToGif } from '../modules/gif-tools';

const ACCENT = '#E91E63';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = 200;

const GifMaker = ({ navigation }) => {
  const [mode, setMode] = useState('images'); // 'images' or 'video'
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null); // { uri, duration, width, height }
  const [fps, setFps] = useState(5);
  const [quality, setQuality] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickImages = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!res.canceled && res.assets?.length > 0) {
        const newImages = res.assets.map((a) => ({
          uri: a.uri,
          width: a.width,
          height: a.height,
        }));
        const combined = [...images, ...newImages];
        if (combined.length > 50) {
          triggerToast('Limit', 'Maximum 50 images allowed', 'alert', 2500);
          setImages(combined.slice(0, 50));
        } else {
          setImages(combined);
        }
        setResult(null);
      }
    } catch {
      triggerToast('Error', 'Failed to pick images', 'error', 2500);
    }
  };

  const pickVideo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 1,
        videoMaxDuration: 5,
      });

      if (!res.canceled && res.assets?.length > 0) {
        const asset = res.assets[0];
        const durationSec = (asset.duration || 0) / 1000;
        if (durationSec > 5) {
          triggerToast('Too Long', 'Video must be 5 seconds or less', 'alert', 3000);
          return;
        }
        setVideo({
          uri: asset.uri,
          duration: durationSec,
          width: asset.width,
          height: asset.height,
        });
        setResult(null);
      }
    } catch {
      triggerToast('Error', 'Failed to pick video', 'error', 2500);
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const makeGif = async () => {
    if (mode === 'video') {
      return makeGifFromVideo();
    }

    if (images.length < 2) {
      triggerToast('Warning', 'Please select at least 2 images', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const cachePath = Paths.cache.uri.replace(/^file:\/\//, '');
      const outputPath = `${cachePath}/ToolsApp_GIF_${Date.now()}.gif`;
      const imagePaths = images.map((img) => img.uri);

      const gifWidth = 480;
      const firstImg = images[0];
      const aspectRatio = firstImg.height / firstImg.width;
      const gifHeight = Math.round(gifWidth * aspectRatio);
      const delayMs = Math.round(1000 / fps);

      const res = await createGif(imagePaths, outputPath, gifWidth, gifHeight, delayMs, quality);
      setResult(res);
      triggerToast('Success', 'GIF created successfully', 'success', 2500);
    } catch (e) {
      console.log('GIF error:', e);
      triggerToast('Error', 'Failed to create GIF', 'error', 2500);
    } finally {
      setLoading(false);
    }
  };

  const makeGifFromVideo = async () => {
    if (!video) {
      triggerToast('Warning', 'Please select a video first', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const cachePath = Paths.cache.uri.replace(/^file:\/\//, '');
      const outputPath = `${cachePath}/ToolsApp_GIF_${Date.now()}.gif`;

      const res = await videoToGif(video.uri, outputPath, 480, fps, quality, 5);
      setResult(res);
      triggerToast('Success', 'GIF created from video', 'success', 2500);
    } catch (e) {
      console.log('Video GIF error:', e);
      triggerToast('Error', 'Failed to convert video to GIF', 'error', 2500);
    } finally {
      setLoading(false);
    }
  };

  const shareGif = async () => {
    if (!result?.path) return;
    try {
      await Sharing.shareAsync('file://' + result.path, {
        mimeType: 'image/gif',
        dialogTitle: 'Share GIF',
      });
    } catch {
      triggerToast('Error', 'Failed to share', 'error', 2500);
    }
  };

  const requestStoragePermission = async () => {
    if (Platform.OS !== 'android' || Platform.Version >= 29) return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'ToolsApp needs storage access to save files to Downloads.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const saveGif = async () => {
    if (!result?.path) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const fileName = `ToolsApp_GIF_${Date.now()}.gif`;
      await saveToDownloads(result.path, fileName, 'image/gif');
      triggerToast('Success', 'Saved to Downloads', 'success', 2500);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const reset = () => {
    setImages([]);
    setVideo(null);
    setFps(5);
    setQuality(10);
    setResult(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>GIF Maker</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Mode Toggle */}
        {!result && (
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'images' && styles.modeBtnActive]}
              onPress={() => { setMode('images'); setVideo(null); }}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Ionicons name="images" size={18} color={mode === 'images' ? '#fff' : colors.textMuted} />
              <Text style={[styles.modeBtnText, mode === 'images' && styles.modeBtnTextActive]}>Images</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]}
              onPress={() => { setMode('video'); setImages([]); }}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Ionicons name="videocam" size={18} color={mode === 'video' ? '#fff' : colors.textMuted} />
              <Text style={[styles.modeBtnText, mode === 'video' && styles.modeBtnTextActive]}>Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {((mode === 'images' && images.length === 0) || (mode === 'video' && !video)) && !result && (
          <View style={styles.emptyState}>
            {mode == 'video' ? <Ionicons name='videocam' size={72} color={colors.emptyIcon} /> : <Ionicons name='images' size={72} color={colors.emptyIcon} />}
            <Text style={styles.emptyTitle}>Create GIF</Text>
            <Text style={styles.emptyDesc}>
              {mode === 'video'
                ? 'Select a video (5 sec max) to convert to GIF'
                : 'Select images to create an animated GIF'}
            </Text>
          </View>
        )}

        {/* Pick Images Button */}
        {mode === 'images' && !result && (
          <TouchableOpacity style={[styles.pickBtn, loading && styles.actionBtnDisabled]} onPress={pickImages} activeOpacity={0.85} disabled={loading}>
            <Ionicons name="images" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>
              {images.length === 0 ? 'Select Images' : 'Add More Images'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Pick Video Button */}
        {mode === 'video' && !video && !result && (
          <TouchableOpacity style={[styles.pickBtn, loading && styles.actionBtnDisabled]} onPress={pickVideo} activeOpacity={0.85} disabled={loading}>
            <Ionicons name="videocam" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>Select Video</Text>
          </TouchableOpacity>
        )}

        {/* Video Preview */}
        {mode === 'video' && video && !result && (
          <View style={styles.videoPreviewSection}>
            <View style={styles.imageSectionHeader}>
              <Text style={styles.imageSectionTitle}>Video selected</Text>
              <TouchableOpacity
                onPress={() => setVideo(null)}
                activeOpacity={0.7}
                style={[styles.clearAllBtn, loading && styles.actionBtnDisabled]}
                disabled={loading}
              >
                <Text style={styles.clearAllText}>Remove</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.videoCard}>
              <Image source={{ uri: video.uri }} style={styles.videoThumb} />
              <View style={styles.videoInfo}>
                <Text style={styles.videoInfoText}>Duration: {video.duration.toFixed(1)}s</Text>
                <Text style={styles.videoInfoText}>{video.width} x {video.height}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Image Thumbnails */}
        {mode === 'images' && images.length > 0 && !result && (
          <View style={styles.imageSection}>
            <View style={styles.imageSectionHeader}>
              <Text style={styles.imageSectionTitle}>{images.length} image{images.length !== 1 ? 's' : ''} selected</Text>
              <TouchableOpacity
                onPress={() => { setImages([]); setResult(null); }}
                activeOpacity={0.7}
                style={[styles.clearAllBtn, loading && styles.actionBtnDisabled]}
                disabled={loading}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageItemContainer}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewIndex(index)} disabled={loading}>
                    <View style={styles.thumbWrapper}>
                      <Image source={{ uri: img.uri }} style={styles.thumb} />

                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeImage(index)}
                        disabled={loading}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>

                      <View style={styles.indexBadge}>
                        <Text style={styles.indexText}>{index + 1}</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => setPreviewIndex(index)}
                        disabled={loading}
                      >
                        <MaterialCommunityIcons name="arrow-expand" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Settings */}
        {((mode === 'images' && images.length >= 2) || (mode === 'video' && video)) && !result && (
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>Settings</Text>

            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Speed (FPS)</Text>
              <Text style={styles.sliderValue}>{fps}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={20}
              step={1}
              value={fps}
              onValueChange={setFps}
              minimumTrackTintColor={ACCENT}
              maximumTrackTintColor={isDark ? '#555' : '#ccc'}
              thumbTintColor={ACCENT}
            />

            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Quality</Text>
              <Text style={styles.sliderValue}>{quality <= 5 ? 'High' : quality <= 15 ? 'Medium' : 'Low'}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={20}
              step={1}
              value={quality}
              onValueChange={setQuality}
              minimumTrackTintColor={ACCENT}
              maximumTrackTintColor={isDark ? '#555' : '#ccc'}
              thumbTintColor={ACCENT}
            />
          </View>
        )}

        {/* Create Button */}
        {((mode === 'images' && images.length >= 2) || (mode === 'video' && video)) && !result && (
          <TouchableOpacity
            style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
            onPress={makeGif}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="file-gif-box" size={22} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>{loading ? 'Creating GIF...' : 'Create GIF'}</Text>
          </TouchableOpacity>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultSection}>
            <View style={styles.resultCard}>
              <Image
                source={{ uri: 'file://' + result.path }}
                style={styles.gifPreview}
                resizeMode="contain"
              />
              <Text style={styles.resultTitle}>GIF Created!</Text>
              <Text style={styles.resultInfo}>{result.frameCount} frames • {formatSize(result.size)}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveGif} activeOpacity={0.8} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareGif} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={reset} activeOpacity={0.85}>
              <Ionicons name="refresh" size={20} color={ACCENT} />
              <Text style={[styles.actionBtnText, { color: ACCENT }]}>Start Over</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Full Image Preview */}
      <ImageViewing
        images={images.map(img => ({ uri: img.uri }))}
        imageIndex={previewIndex !== null ? previewIndex : 0}
        visible={previewIndex !== null}
        onRequestClose={() => setPreviewIndex(null)}
        presentationStyle="overFullScreen"
        HeaderComponent={() => (
          <View style={styles.imageViewerHeader}>
            <TouchableOpacity
              style={styles.imageViewerCloseBtn}
              onPress={() => setPreviewIndex(null)}
            >
              <Ionicons name="close" size={28} color="#000000" />
            </TouchableOpacity>
          </View>
        )}
        FooterComponent={({ imageIndex }) => (
          <View style={styles.imageViewerFooter}>
            <Text style={styles.imageViewerCounter}>
              {imageIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const createStyles = (colors, isDark) =>
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
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.textTertiary, marginTop: 20 },
    emptyDesc: {
      fontSize: 14, color: colors.textMuted, textAlign: 'center',
      marginTop: 8, lineHeight: 20, paddingHorizontal: 20,
    },

    modeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 60,
      padding: 4,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    modeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 56,
      gap: 8,
    },
    modeBtnActive: {
      backgroundColor: ACCENT,
    },
    modeBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textMuted,
    },
    modeBtnTextActive: {
      color: '#fff',
    },

    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      borderRadius: 60,
      padding: 16,
      gap: 10,
      marginBottom: 20,
    },
    pickBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },

    imageSection: { marginTop: 0, marginBottom: 6 },
    imageSectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
    },
    imageSectionTitle: { color: colors.sectionSubtitle || colors.textSecondary, fontSize: 14, fontWeight: '600' },
    clearAllBtn: { backgroundColor: '#FF4444', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    clearAllText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    horizontalScroll: { gap: 14, paddingVertical: 14, paddingRight: 20 },
    imageItemContainer: { marginRight: 14 },
    thumbWrapper: {
      width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 19, borderWidth: 2, borderColor: '#D3DAE5',
    },
    thumb: { width: '100%', height: '100%', borderRadius: 20 },
    removeBtn: {
      position: 'absolute', top: -10, right: -10, backgroundColor: '#FF0000',
      borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    },
    indexBadge: {
      position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    },
    indexText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    expandBtn: {
      position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    },

    videoPreviewSection: { marginBottom: 20 },
    videoCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    videoThumb: {
      width: '100%',
      height: 200,
      backgroundColor: '#000',
    },
    videoInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 14,
      paddingHorizontal: 18,
    },
    videoInfoText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },

    settingsSection: {
      backgroundColor: colors.card,
      borderRadius: 28,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    sliderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
    },
    sliderLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    sliderValue: { fontSize: 14, fontWeight: '700', color: ACCENT },
    slider: { width: '100%', height: 40 },

    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      borderRadius: 60,
      padding: 16,
      gap: 10,
      marginBottom: 12,
    },
    actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    actionBtnDisabled: { opacity: 0.6 },
    actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    saveBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.saveBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
    },
    saveBtnText: { color: colors.saveBtnText, fontSize: 16, fontWeight: '700' },
    shareBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.shareBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
    },
    shareBtnText: { color: colors.shareBtnText, fontSize: 16, fontWeight: '700' },

    resetBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: ACCENT,
    },

    resultSection: { marginTop: 10 },
    resultCard: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 30,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: ACCENT + '40',
    },
    gifPreview: {
      width: SCREEN_WIDTH - 80,
      height: SCREEN_WIDTH - 80,
      borderRadius: 12,
      marginBottom: 14,
    },
    resultTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    resultInfo: { fontSize: 14, color: colors.textMuted, marginTop: 6 },

    // ImageViewing
    imageViewerHeader: {
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
      paddingHorizontal: 20, paddingBottom: 10,
    },
    imageViewerCloseBtn: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgb(255,255,255)',
      alignItems: 'center', justifyContent: 'center', elevation: 10,
    },
    imageViewerFooter: {
      alignItems: 'center', paddingBottom: 70,
    },
    imageViewerCounter: {
      fontSize: 16, fontWeight: '600', color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    },
  });

export default GifMaker;
