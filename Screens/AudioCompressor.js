import { useState, useEffect, useRef, useMemo } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { File, Paths } from 'expo-file-system';
import { compressAudio as nativeCompress } from '../modules/audio-compressor';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useTheme } from '../Services/ThemeContext';

const ACCENT = '#ff0000';
const ACCENT_LIGHT = '#ff0000';

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

const AudioCompressor = ({ navigation }) => {
  const [audio, setAudio] = useState(null);
  const [quality, setQuality] = useState(0.5);
  const [compressedUri, setCompressedUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [originalSize, setOriginalSize] = useState(null);
  const [compressedSize, setCompressedSize] = useState(null);
  const [mode, setMode] = useState('quality');
  const [targetSize, setTargetSize] = useState('');
  const [targetUnit, setTargetUnit] = useState('KB');
  const [playingCompressed, setPlayingCompressed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [audioName, setAudioName] = useState('');
  const [tempAudioName, setTempAudioName] = useState('');
  const originalDurationSec = useRef(null);
  const justPicked = useRef(false);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    if (justPicked.current && status.duration > 0) {
      originalDurationSec.current = status.duration;
      justPicked.current = false;
    }
  }, [status.duration]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish]);

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];

      setPlayingCompressed(false);
      setAudio({ uri: asset.uri, name: asset.name });
      setCompressedUri(null);
      setCompressedSize(null);
      originalDurationSec.current = null;
      justPicked.current = true;

      try {
        const file = new File(asset.uri);
        if (file.exists) setOriginalSize(file.size);
      } catch {
        setOriginalSize(asset.size || null);
      }

      try {
        player.replace({ uri: asset.uri });
      } catch (e) {
        console.log('Audio load error:', e);
      }
    }
  };

  const togglePlayback = (uri, isCompressed) => {
    try {
      if (status.playing && playingCompressed === isCompressed) {
        player.pause();
        return;
      }

      if (playingCompressed !== isCompressed) {
        player.replace({ uri });
        setPlayingCompressed(isCompressed);
      }

      player.play();
    } catch (e) {
      console.log('Playback error:', e);
      triggerToast('Error', 'Failed to play audio.', 'error', 3000);
    }
  };

  const compressAudio = async () => {
    if (!audio) return;
    setLoading(true);
    try {
      if (status.playing) player.pause();

      let targetBitrate;
      const durationSec = originalDurationSec.current;

      if (mode === 'quality') {
        if (originalSize && durationSec && durationSec > 0) {
          const originalBitrate = (originalSize * 8) / durationSec;
          targetBitrate = Math.round(originalBitrate * quality);
        } else {
          targetBitrate = Math.round(320000 * quality);
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
          triggerToast('Invalid size', 'Target size must be smaller than the original audio size.', 'alert', 3000);
          setLoading(false);
          return;
        }

        // Check minimum possible size (32kbps AAC floor)
        if (durationSec && durationSec > 0) {
          const minBytes = (32000 * durationSec) / 8;
          if (targetBytes < minBytes) {
            triggerToast('Too small', `Minimum possible size for this audio is ~${formatSize(minBytes)}. AAC encoder cannot go below 32kbps.`, 'alert', 4000);
            setLoading(false);
            return;
          }
        }

        if (durationSec && durationSec > 0) {
          targetBitrate = Math.round((targetBytes * 8) / durationSec);
        } else {
          triggerToast('Error', 'Could not determine audio duration.', 'error', 3000);
          setLoading(false);
          return;
        }
      }

      targetBitrate = Math.max(targetBitrate, 32000);

      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const outPath = `${cacheDir}/ToolsApp_Compressed_${Date.now()}.m4a`;

      const res = await nativeCompress(audio.uri, outPath, targetBitrate);

      if (res.size < 100) {
        triggerToast('Error', 'Compression produced an invalid file. Try a different audio.', 'error', 3000);
        setLoading(false);
        return;
      }

      setCompressedUri(res.path);
      setCompressedSize(res.size);
    } catch (error) {
      console.log('Audio compression error:', error);
      triggerToast('Error', 'Failed to compress audio. Please try again.', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const shareAudio = async () => {
    if (!compressedUri) return;
    await Sharing.shareAsync(compressedUri, { mimeType: 'audio/*' });
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

  const saveAudio = async () => {
    if (!compressedUri) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const filePath = compressedUri.replace(/^file:\/\//, '');
      const fileName = audioName.trim() ? `${audioName.trim()}.m4a` : `ToolsApp_Compressed_${Date.now()}.m4a`;
      await saveToDownloads(filePath, fileName, 'audio/mp4');
      triggerToast('Success', 'Saved to Downloads', 'success', 2500);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (secs) => {
    if (!secs) return '0:00';
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const reductionPercent = originalSize && compressedSize
    ? Math.round((1 - compressedSize / originalSize) * 100)
    : null;

  const durationSec = status.duration || 0;
  const currentTimeSec = status.currentTime || 0;
  const isPlaying = status.playing;
  const progressPercent = durationSec > 0 ? Math.min((currentTimeSec / durationSec) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={loading}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Audio Compressor</Text>
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
          {!audio && (
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes" size={64} color={colors.emptyIcon} />
              <Text style={styles.emptyTitle}>No audio selected</Text>
              <Text style={styles.emptyDesc}>
                Pick an audio file to compress it
              </Text>
            </View>
          )}

          {/* Audio Player Card */}
          {audio && (
            <View style={styles.playerCard}>
              <View style={styles.playerTop}>
                <View style={styles.audioIconCircle}>
                  <Ionicons name="musical-notes" size={28} color={accent} />
                </View>
                <View style={styles.audioInfo}>
                  <Text style={styles.audioName} numberOfLines={1}>
                    {playingCompressed && compressedUri ? 'Compressed Audio' : audio.name}
                  </Text>
                  <Text style={styles.audioDuration}>{formatDuration(durationSec)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={() => togglePlayback(compressedUri || audio.uri, !!compressedUri && playingCompressed)}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              {/* Playback Progress */}
              <View style={styles.playbackBarBg}>
                <View style={[styles.playbackBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <View style={styles.playbackTimeRow}>
                <Text style={styles.playbackTime}>{formatDuration(currentTimeSec)}</Text>
                <Text style={styles.playbackTime}>{formatDuration(durationSec)}</Text>
              </View>

              {/* Toggle Original / Compressed playback */}
              {compressedUri && (
                <View style={styles.playbackToggle}>
                  <TouchableOpacity
                    style={[styles.playbackToggleBtn, !playingCompressed && styles.playbackToggleBtnActive]}
                    onPress={() => togglePlayback(audio.uri, false)}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.playbackToggleText, !playingCompressed && styles.playbackToggleTextActive]}>Original</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.playbackToggleBtn, playingCompressed && styles.playbackToggleBtnActive]}
                    onPress={() => togglePlayback(compressedUri, true)}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.playbackToggleText, playingCompressed && styles.playbackToggleTextActive]}>Compressed</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Size Info */}
          {audio && (
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

          {/* Pick Audio Button */}
          <TouchableOpacity style={styles.pickBtn} onPress={pickAudio} activeOpacity={0.8} disabled={loading}>
            <Ionicons name="musical-notes" size={22} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>
              {!audio ? 'Pick Audio' : 'Change Audio'}
            </Text>
          </TouchableOpacity>

          {/* Mode Toggle */}
          {audio && !compressedUri && (
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
          {audio && !compressedUri && mode === 'quality' && (
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
          {audio && !compressedUri && mode === 'targetSize' && (
            <View style={styles.targetSection}>
              <Text style={styles.qualityTitle}>Enter Target Size</Text>
              <View style={styles.targetRow}>
                <TextInput
                  style={styles.targetInput}
                  placeholder="e.g. 500"
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
          {audio && !compressedUri && (
            <TouchableOpacity
              style={[styles.compressBtn, loading && styles.btnDisabled]}
              onPress={compressAudio}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <AntDesign name="compress" size={24} color="white" />
              )}
              <Text style={[styles.compressBtnText,loading && styles.textDisabled]}>
                {loading ? 'Compressing...' : 'Compress Audio'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Result Section */}
          {compressedUri && (
            <View style={styles.resultSection}>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={28} color={accent} />
                <Text style={styles.successText}>Audio Compressed!</Text>
              </View>

              {/* Rename Button */}
              <TouchableOpacity
                style={styles.renameBtn}
                onPress={() => {
                  setTempAudioName(audioName);
                  setRenameModalVisible(true);
                }}
                activeOpacity={0.7}
                disabled={loading || saving}
              >
                <Ionicons name="pencil" size={20} color={colors.textPrimary} />
                <Text style={styles.renameBtnLabel}>Rename Audio</Text>
                <View style={styles.renameBtnRight}>
                  <Text style={styles.renameBtnValue}>
                    {audioName
                      ? (audioName.length > 17 ? audioName.substring(0, 17) + '...' : audioName)
                      : 'Default'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveAudio} activeOpacity={0.8} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.saveBtnText} />
                  ) : (
                    <Ionicons name="download" size={20} color={colors.saveBtnText} />
                  )}
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={shareAudio} activeOpacity={0.8}>
                  <Ionicons name="share" size={20} color={colors.shareBtnText} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setCompressedUri(null);
                  setCompressedSize(null);
                  setPlayingCompressed(false);
                  if (isPlaying) player.pause();
                }}
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

      {/* Rename Audio Modal */}
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
                  <Text style={styles.renameModalTitle}>Rename Audio</Text>

                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter audio name..."
                    placeholderTextColor={colors.textSecondary}
                    value={tempAudioName}
                    onChangeText={setTempAudioName}
                    autoFocus
                  />

                  <View style={styles.renameButtonsContainer}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => {
                        setRenameModalVisible(false);
                        setTempAudioName(audioName);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.renameDoneButton}
                      onPress={() => {
                        if (tempAudioName.trim() === '') {
                          triggerToast('Error', 'Please enter a name for the audio', 'error', 2000);
                          return;
                        }
                        setAudioName(tempAudioName);
                        setRenameModalVisible(false);
                        triggerToast('Success', 'Audio name updated', 'success', 2000);
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

  // Audio Player Card
  playerCard: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 33,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  audioIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioInfo: {
    flex: 1,
  },
  audioName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  audioDuration: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playbackBarBg: {
    height: 4,
    backgroundColor: colors.border2,
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  playbackBarFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: 2,
  },
  playbackTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  playbackTime: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  playbackToggle: {
    flexDirection: 'row',
    backgroundColor: colors.toggleInnerBg,
    borderRadius: 60,
    padding: 3,
    marginTop: 12,
    gap: 3,
  },
  playbackToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 60,
    alignItems: 'center',
  },
  playbackToggleBtnActive: {
    backgroundColor: accent,
  },
  playbackToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  playbackToggleTextActive: {
    color: '#fff',
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
    backgroundColor: '#8f1010',
  },
textDisabled:{
  color:"lightgrey"
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
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
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

export default AudioCompressor;
