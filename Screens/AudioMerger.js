import { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../Services/ThemeContext';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { triggerToast } from '../Services/toast';
import { getAudioInfo, mergeAudios, addProgressListener } from '../modules/audio-merger';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#6200EA';
const ACCENT_LIGHT = '#7C4DFF';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FILE_LIST_MAX_HEIGHT = 350;

const formatDuration = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AudioMerger = ({ navigation }) => {
  const [audioFiles, setAudioFiles] = useState([]);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mergedResult, setMergedResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [audioName, setAudioName] = useState('');
  const [tempAudioName, setTempAudioName] = useState('');
  const scrollRef = useRef(null);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const disabled = merging || saving;

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const newFiles = [];
      for (const asset of result.assets) {
        try {
          const info = await getAudioInfo(asset.uri);
          newFiles.push({
            uri: asset.uri,
            name: asset.name || info.name || 'Unknown',
            duration: info.duration,
            sampleRate: info.sampleRate,
            channels: info.channels,
            mimeType: info.mimeType,
          });
        } catch (e) {
          triggerToast('Error', `Could not read: ${asset.name}`, 'error', 2500);
        }
      }

      if (newFiles.length > 0) {
        setAudioFiles(prev => [...prev, ...newFiles]);
        setMergedResult(null);
        triggerToast('Added', `${newFiles.length} audio file(s) added`, 'success', 1500);
      }
    } catch (e) {
      triggerToast('Error', 'Failed to pick audio files', 'error', 2500);
    }
  };

  const removeFile = (index) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
    setMergedResult(null);
  };

  const moveFile = (index, direction) => {
    setAudioFiles(prev => {
      const arr = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= arr.length) return arr;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
    setMergedResult(null);
  };

  const clearAll = () => {
    setAudioFiles([]);
    setMergedResult(null);
    setProgress(0);
  };

  const startMerge = async () => {
    if (audioFiles.length < 2) {
      triggerToast('Minimum 2 Files', 'Add at least 2 audio files to merge', 'error', 2500);
      return;
    }

    setMerging(true);
    setProgress(0);
    setMergedResult(null);

    const subscription = addProgressListener((data) => {
      setProgress(data.progress);
    });

    try {
      const uris = audioFiles.map(f => f.uri);
      const outputName = `merged_audio_${Date.now()}`;
      const result = await mergeAudios(uris, outputName);

      setMergedResult(result);
      triggerToast('Merged!', 'Audio files merged successfully', 'success', 2500);
    } catch (e) {
      triggerToast('Error', `Merge failed: ${e.message}`, 'error', 3000);
    } finally {
      subscription.remove();
      setMerging(false);
      setProgress(0);
    }
  };

  const shareResult = async () => {
    if (!mergedResult) return;
    try {
      await Sharing.shareAsync(mergedResult.uri, { mimeType: 'audio/mp4' });
    } catch (e) {
      triggerToast('Error', 'Failed to share', 'error', 2000);
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

  const saveResult = async () => {
    if (!mergedResult) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Permission Denied', 'Storage permission is required to save', 'error', 2500);
        return;
      }
      const fileName = audioName.trim() ? `${audioName.trim()}.m4a` : `merged_audio_${Date.now()}.m4a`;
      const filePath = mergedResult.uri.replace(/^file:\/\//, '');
      await saveToDownloads(filePath, fileName, 'audio/mp4');
      triggerToast('Saved', 'Merged audio saved to Downloads', 'success', 2500);
    } catch (e) {
      triggerToast('Error', `Failed to save: ${e.message}`, 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = audioFiles.reduce((sum, f) => sum + f.duration, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={disabled}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Audio Merger</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        {audioFiles.length === 0 && !mergedResult && (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No audio files added</Text>
            <Text style={styles.emptyDesc}>
              Add 2 or more audio files to merge them into one
            </Text>
          </View>
        )}

        {/* Add Audio Button */}
        <TouchableOpacity
          style={[styles.pickBtn, disabled && styles.buttonDisabled]}
          onPress={pickAudio}
          activeOpacity={0.8}
          disabled={disabled}
        >
          <Ionicons name="musical-notes" size={22} color={colors.textPrimary} />
          <Text style={styles.pickBtnText}>
            {audioFiles.length === 0 ? 'Add Audio Files' : 'Add More Files'}
          </Text>
        </TouchableOpacity>

        {/* Audio Files List */}
        {audioFiles.length > 0 && (
          <View style={styles.filesSection}>
            <View style={styles.filesSectionHeader}>
              <Text style={styles.sectionTitle}>
                {audioFiles.length} File{audioFiles.length > 1 ? 's' : ''} · {formatDuration(totalDuration)}
              </Text>
              <TouchableOpacity
                onPress={clearAll}
                activeOpacity={0.7}
                style={[styles.clearAllBtn, disabled && styles.buttonDisabled]}
                disabled={disabled}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              nestedScrollEnabled
              style={styles.filesList}
              showsVerticalScrollIndicator={false}
            >
              {audioFiles.map((file, index) => (
                <View key={`${file.name}-${index}`} style={styles.fileCard}>
                  <View style={styles.fileIndex}>
                    <Text style={styles.fileIndexText}>{index + 1}</Text>
                  </View>

                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.fileMeta}>
                      {formatDuration(file.duration)} · {file.sampleRate}Hz · {file.channels === 1 ? 'Mono' : 'Stereo'}
                    </Text>
                  </View>

                  <View style={styles.fileActions}>
                    {index > 0 && (
                      <TouchableOpacity onPress={() => moveFile(index, -1)} style={styles.fileActionBtn} disabled={disabled}>
                        <Ionicons name="chevron-up" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    {index < audioFiles.length - 1 && (
                      <TouchableOpacity onPress={() => moveFile(index, 1)} style={styles.fileActionBtn} disabled={disabled}>
                        <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeFile(index)} style={styles.fileActionBtn} disabled={disabled}>
                      <Ionicons name="close-circle" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Merge Button */}
        {audioFiles.length >= 2 && !mergedResult && (
          <TouchableOpacity
            style={[styles.mergeBtn, merging && styles.mergeBtnDisabled]}
            onPress={startMerge}
            activeOpacity={0.8}
            disabled={merging}
          >
            {merging ? (
              <View style={styles.mergingContent}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.mergeBtnText}>Merging... {progress}%</Text>
              </View>
            ) : (
              <>
                <MaterialCommunityIcons name="merge" size={22} color="#fff" />
                <Text style={styles.mergeBtnText}>Merge Audio Files</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Progress Bar */}
        {merging && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}

        {/* Result */}
        {mergedResult && (
          <View style={styles.resultSection}>
            <View style={styles.resultCard}>
              <MaterialCommunityIcons name="check-circle" size={40} color="#4CAF50" />
              <Text style={styles.resultTitle}>Merge Complete!</Text>
              <Text style={styles.resultMeta}>
                Duration: {formatDuration(mergedResult.duration)} · Size: {formatSize(mergedResult.size)}
              </Text>
            </View>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => {
                setTempAudioName(audioName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={disabled}
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

            {/* Save & Share Row */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveResult}
                activeOpacity={0.8}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.saveBtnText} size="small" />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareBtn} onPress={shareResult} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Merge Again */}
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => setMergedResult(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Merge Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

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
  buttonDisabled: {
    opacity: 0.4,
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

  // Files Section
  filesSection: {
    marginTop: 20,
  },
  filesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clearAllBtn: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  clearAllText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filesList: {
    maxHeight: FILE_LIST_MAX_HEIGHT,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 54,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  fileIndex: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIndexText: {
    fontSize: 13,
    fontWeight: '800',
    color: accent,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fileMeta: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  fileActionBtn: {
    padding: 4,
  },

  // Merge Button
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 16,
    gap: 10,
  },
  mergeBtnDisabled: {
    opacity: 0.7,
  },
  mergeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  mergingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Progress
  progressContainer: {
    marginTop: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: 3,
  },

  // Result Section
  resultSection: {
    marginTop: 20,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
  },
  resultMeta: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 6,
  },

  // Save & Share Row (matching VideoCompressor)
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

  // Retry / Merge Again (matching MergePDF/ImageCompressor)
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

export default AudioMerger;
