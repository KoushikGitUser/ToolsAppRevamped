import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { triggerToast } from '../Services/toast';
import * as ImagePicker from 'expo-image-picker';
import { Video as CompressorVideo } from 'react-native-compressor';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../Services/ThemeContext';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#3f51c3';
const ACCENT_LIGHT = '#6370D1';

const QUALITY_OPTIONS = [
  { label: '10%', value: 0.1 },
  { label: '20%', value: 0.2 },
  { label: '30%', value: 0.3 },
  { label: '40%', value: 0.4 },
  { label: '50%', value: 0.5 },
  { label: '60%', value: 0.6 },
  { label: '70%', value: 0.7 },
  { label: '80%', value: 0.8 },
  { label: '90%', value: 0.9 },
];

const VideoCompressor = ({ navigation }) => {
  const [video, setVideo] = useState(null);
  const [quality, setQuality] = useState(0.5);
  const [compressedUri, setCompressedUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [originalSize, setOriginalSize] = useState(null);
  const [compressedSize, setCompressedSize] = useState(null);
  const [mode, setMode] = useState('quality');
  const [targetSize, setTargetSize] = useState('');
  const [targetUnit, setTargetUnit] = useState('MB');
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [videoName, setVideoName] = useState('');
  const [tempVideoName, setTempVideoName] = useState('');

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const player = useVideoPlayer(null, (p) => { p.loop = false; });

  useEffect(() => {
    const source = compressedUri || video?.uri;
    if (source) player.replace({ uri: source });
  }, [video?.uri, compressedUri]);

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission needed', 'Please grant gallery access to pick a video.', 'alert', 3000);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setVideo(asset);
      setCompressedUri(null);
      setCompressedSize(null);
      setProgress(0);

      try {
        const file = new File(asset.uri);
        if (file.exists) {
          setOriginalSize(file.size);
        }
      } catch {
        setOriginalSize(null);
      }
    }
  };

  const getFileSize = (uri) => {
    try {
      const file = new File(uri);
      return file.exists ? file.size : null;
    } catch {
      return null;
    }
  };

  const compressVideo = async () => {
    if (!video) return;
    setLoading(true);
    setProgress(0);
    try {
      let targetBitrate;
      const durationSec = video.duration ? video.duration / 1000 : null;

      if (mode === 'quality') {
        if (originalSize && durationSec && durationSec > 0) {
          const originalBitrate = (originalSize * 8) / durationSec;
          targetBitrate = Math.round(originalBitrate * quality);
        } else {
          targetBitrate = Math.round(5000000 * quality);
        }
      } else {
        const sizeNum = parseFloat(targetSize);
        if (!sizeNum || sizeNum <= 0) {
          triggerToast('Invalid size', 'Please enter a valid target size.', 'alert', 3000);
          setLoading(false);
          return;
        }
        const targetBytes = targetUnit === 'MB' ? sizeNum * 1024 * 1024 : sizeNum * 1024;

        if (originalSize && targetBytes >= originalSize) {
          triggerToast('Invalid size', 'Target size must be smaller than the original video size.', 'alert', 3000);
          setLoading(false);
          return;
        }

        if (durationSec && durationSec > 0) {
          targetBitrate = Math.round((targetBytes * 8) / durationSec);
        } else {
          triggerToast('Error', 'Could not determine video duration.', 'error', 3000);
          setLoading(false);
          return;
        }
      }

      targetBitrate = Math.max(targetBitrate, 100000);

      const result = await CompressorVideo.compress(
        video.uri,
        {
          compressionMethod: 'manual',
          bitrate: targetBitrate,
        },
        (prog) => {
          setProgress(prog);
        }
      );

      const resultSize = getFileSize(result);
      if (!resultSize || resultSize < 1000) {
        triggerToast('Incompatible Format', 'This video format cannot be compressed. Please try a different video.', 'error', 4000);
        setVideo(null);
        setOriginalSize(null);
        setProgress(0);
        return;
      }

      setCompressedUri(result);
      setCompressedSize(resultSize);
    } catch (error) {
      console.log('Video compression error:', error);
      triggerToast('Error', 'Failed to compress video. Please try again.', 'error', 3000);
    } finally {
      setLoading(false);
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

  const saveVideo = async () => {
    if (!compressedUri) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Permission needed', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const filePath = compressedUri.replace(/^file:\/\//, '');
      const fileName = videoName.trim() ? `${videoName.trim()}.mp4` : `ToolsApp_Video_${Date.now()}.mp4`;
      await saveToDownloads(filePath, fileName, 'video/mp4');
      triggerToast('Saved', 'Compressed video saved to Downloads.', 'success', 3000);
    } catch (error) {
      console.log('Save error:', error);
      triggerToast('Error', 'Failed to save video.', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const shareVideo = async () => {
    if (!compressedUri) return;
    await Sharing.shareAsync(compressedUri, { mimeType: 'video/mp4' });
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (ms) => {
    if (!ms) return '';
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const reductionPercent = originalSize && compressedSize
    ? Math.round((1 - compressedSize / originalSize) * 100)
    : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={loading}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Video Compressor</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty State */}
          {!video && (
            <View style={styles.emptyState}>
              <Ionicons name="videocam" size={64} color={colors.emptyIcon} />
              <Text style={styles.emptyTitle}>No video selected</Text>
              <Text style={styles.emptyDesc}>
                Pick a video from your gallery to compress it
              </Text>
            </View>
          )}

          {/* Video Preview */}
          {video && (
            <View style={styles.previewSection}>
              <VideoView
                player={player}
                style={styles.preview}
                nativeControls
                fullscreenOptions={{ isFullscreenEnabled: true }}
              />
              {compressedUri && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Compressed</Text>
                </View>
              )}
              {video.duration > 0 && (
                <View style={styles.durationBadge}>
                  <Ionicons name="time-outline" size={13} color="#fff" />
                  <Text style={styles.durationText}>{formatDuration(video.duration)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Size Info */}
          {video && (
            <View style={styles.sizeRow}>
              <View style={styles.sizeCard}>
                <Text style={styles.sizeLabel}>Original</Text>
                <Text style={styles.sizeValue}>{formatSize(originalSize)}</Text>
              </View>
              {compressedSize ? (
                <View style={styles.sizeCard}>
                  <Text style={styles.sizeLabel}>Compressed</Text>
                  <Text style={[styles.sizeValue, { color: accent }]}>{formatSize(compressedSize)}</Text>
                </View>
              ) : (
                <View style={styles.sizeCard}>
                  <Text style={styles.sizeLabel}>Compressed</Text>
                  <Text style={styles.sizeValue}>—</Text>
                </View>
              )}
              {reductionPercent !== null && (
                <View style={[styles.sizeCard, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
                  <Text style={styles.sizeLabel}>Reduced</Text>
                  <Text style={[styles.sizeValue, { color: accent }]}>{reductionPercent}%</Text>
                </View>
              )}
            </View>
          )}

          {/* Pick Video Button */}
          <TouchableOpacity style={styles.pickBtn} onPress={pickVideo} activeOpacity={0.8} disabled={loading}>
            <Ionicons name="videocam" size={22} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>
              {!video ? 'Pick Video' : 'Change Video'}
            </Text>
          </TouchableOpacity>

          {/* Mode Toggle */}
          {video && !compressedUri && (
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'quality' && styles.modeBtnActive]}
                onPress={() => setMode('quality')}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={[styles.modeBtnText, mode === 'quality' && styles.modeBtnTextActive]}>By Quality</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'targetSize' && styles.modeBtnActive]}
                onPress={() => setMode('targetSize')}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={[styles.modeBtnText, mode === 'targetSize' && styles.modeBtnTextActive]}>By Target Size</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quality Selection */}
          {video && !compressedUri && mode === 'quality' && (
            <View style={styles.qualitySection}>
              <Text style={styles.qualityTitle}>Select Quality: <Text style={{ color: accent }}>{Math.round(quality * 100)}%</Text></Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.qualityScroll}
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.qualityChip,
                      quality === opt.value && styles.qualityChipActive,
                    ]}
                    onPress={() => setQuality(opt.value)}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.qualityChipText,
                        quality === opt.value && styles.qualityChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Target Size Input */}
          {video && !compressedUri && mode === 'targetSize' && (
            <View style={styles.targetSection}>
              <Text style={styles.qualityTitle}>Enter Target Size</Text>
              <View style={styles.targetRow}>
                <TextInput
                  style={styles.targetInput}
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={targetSize}
                  onChangeText={setTargetSize}
                />
                <View style={styles.unitToggle}>
                  <TouchableOpacity
                    style={[styles.unitBtn, targetUnit === 'KB' && styles.unitBtnActive]}
                    onPress={() => setTargetUnit('KB')}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.unitBtnText, targetUnit === 'KB' && styles.unitBtnTextActive]}>KB</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, targetUnit === 'MB' && styles.unitBtnActive]}
                    onPress={() => setTargetUnit('MB')}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.unitBtnText, targetUnit === 'MB' && styles.unitBtnTextActive]}>MB</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Compress Button */}
          {video && !compressedUri && (
            <TouchableOpacity
              style={[styles.compressBtn, loading && styles.btnDisabled]}
              onPress={compressVideo}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <AntDesign name="compress" size={24} color="white" />
              )}
              <Text style={styles.compressBtnText}>
                {loading ? `Compressing... ${Math.round(progress * 100)}%` : 'Compress Video'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Progress Bar */}
          {loading && (
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          )}

          {/* Result Section */}
          {compressedUri && (
            <View style={styles.resultSection}>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={28} color={accent} />
                <Text style={styles.successText}>Video Compressed!</Text>
              </View>

              {/* Rename Button */}
              <TouchableOpacity
                style={styles.renameBtn}
                onPress={() => {
                  setTempVideoName(videoName);
                  setRenameModalVisible(true);
                }}
                activeOpacity={0.7}
                disabled={loading || saving}
              >
                <Ionicons name="pencil" size={20} color={colors.textPrimary} />
                <Text style={styles.renameBtnLabel}>Rename Video</Text>
                <View style={styles.renameBtnRight}>
                  <Text style={styles.renameBtnValue}>
                    {videoName
                      ? (videoName.length > 17 ? videoName.substring(0, 17) + '...' : videoName)
                      : 'Default'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveVideo} activeOpacity={0.8} disabled={loading || saving}>
                  {saving ? (
                    <ActivityIndicator color={colors.saveBtnText} size="small" />
                  ) : (
                    <Ionicons name="download" size={20} color={colors.saveBtnText} />
                  )}
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={shareVideo} activeOpacity={0.8} disabled={loading}>
                  <Ionicons name="share" size={20} color={colors.shareBtnText} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { setCompressedUri(null); setCompressedSize(null); setProgress(0); }}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Ionicons name="refresh" size={20} color={colors.textPrimary} />
                <Text style={styles.retryBtnText}>Compress Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rename Video Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.renameModalOverlay}>
              <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
              <TouchableWithoutFeedback>
                <View style={styles.renameModalBox}>
                  <Text style={styles.renameModalTitle}>Rename Video</Text>

                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter video name..."
                    placeholderTextColor={colors.textSecondary}
                    value={tempVideoName}
                    onChangeText={setTempVideoName}
                    autoFocus
                  />

                  <View style={styles.renameButtonsContainer}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => {
                        setRenameModalVisible(false);
                        setTempVideoName(videoName);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.renameDoneButton}
                      onPress={() => {
                        if (tempVideoName.trim() === '') {
                          triggerToast('Error', 'Please enter a name for the video', 'error', 2000);
                          return;
                        }
                        setVideoName(tempVideoName);
                        setRenameModalVisible(false);
                        triggerToast('Success', 'Video name updated', 'success', 2000);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameDoneButtonText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const createStyles = (colors, accent, isDark) => StyleSheet.create({
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
  backBtn: {
    marginRight: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  previewSection: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  preview: {
    width: '100%',
    height: 280,
    borderRadius: 26,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  durationBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Size Info
  sizeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sizeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 62,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sizeLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  sizeValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
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
  },
  pickBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Mode Toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 60,
    padding: 4,
    marginTop: 16,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 60,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: accent,
  },
  modeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modeBtnTextActive: {
    color: '#fff',
  },

  // Target Size
  targetSection: {
    marginTop: 20,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  targetInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 60,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: 60,
    padding: 4,
  },
  unitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 60,
  },
  unitBtnActive: {
    backgroundColor: accent,
  },
  unitBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  unitBtnTextActive: {
    color: '#fff',
  },

  // Quality Section
  qualitySection: {
    marginTop: 20,
  },
  qualityTitle: {
    color: colors.qualityTitle,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  qualityScroll: {
    gap: 10,
    paddingRight: 20,
  },
  qualityChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  qualityChipActive: {
    backgroundColor: accent + '25',
    borderColor: accent,
  },
  qualityChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  qualityChipTextActive: {
    color: accent,
  },

  // Compress Button
  compressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 16,
    gap: 10,
  },
  compressBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Progress Bar
  progressBarBg: {
    height: 6,
    backgroundColor: colors.card,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: 3,
  },

  // Result Section
  resultSection: {
    marginTop: 20,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent + '20',
    borderRadius: 60,
    borderWidth: 1,
    borderColor: accent + '40',
    paddingVertical: 14,
    gap: 10,
  },
  successText: {
    color: accent,
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
  },
  retryBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Rename Button
  renameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 19,
    gap: 10,
    marginTop: 12,
  },
  renameBtnLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  renameBtnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameBtnValue: {
    color: accent,
    fontSize: 15,
    fontWeight: '600',
  },

  // Rename Modal
  renameModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  renameModalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
  },
  renameModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  renameInput: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    marginBottom: 20,
  },
  renameButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  renameCancelButton: {
    flex: 1,
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    paddingVertical: 16,
    borderRadius: 60,
    alignItems: 'center',
  },
  renameCancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  renameDoneButton: {
    flex: 1,
    backgroundColor: accent,
    paddingVertical: 16,
    borderRadius: 60,
    alignItems: 'center',
  },
  renameDoneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default VideoCompressor;
