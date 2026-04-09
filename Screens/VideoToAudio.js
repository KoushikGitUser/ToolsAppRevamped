import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  PermissionsAndroid,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { useTheme } from '../Services/ThemeContext';
import { VideoView, useVideoPlayer } from 'expo-video';
import { extractAudio } from '../modules/audio-extractor';

const ACCENT = '#0053ff';

const VideoToAudio = ({ navigation }) => {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [outputUri, setOutputUri] = useState(null);
  const [outputSize, setOutputSize] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [tempAudioName, setTempAudioName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const player = useVideoPlayer(null, (p) => { p.loop = false; });

  useEffect(() => {
    if (video?.uri) player.replace({ uri: video.uri });
  }, [video?.uri]);

  const pickVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setVideo({ uri: asset.uri, name: asset.name, size: asset.size });
      setOutputUri(null);
      setOutputSize(null);
      setAudioName('');
    }
  };

  const convertVideo = async () => {
    if (!video) return;
    setLoading(true);
    try {
      // Strip file:// prefix for native module
      const inputPath = video.uri.replace(/^file:\/\//, '');

      // Use the same directory as the input (DocumentPicker copies to app cache — always writable)
      const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1);
      const safeName = audioName.trim()
        ? audioName.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '_')
        : 'VideoToAudio_ToolsApp';
      const m4aOutputPath = `${inputDir}${safeName}.m4a`;

      // Native extraction using MediaExtractor (Android) / AVAssetExportSession (iOS)
      const result = await extractAudio(inputPath, m4aOutputPath);

      setOutputUri(`file://${result.path}`);
      setOutputSize(result.size || null);

      triggerToast('Done', 'Audio extracted successfully!', 'success', 2500);
    } catch (error) {
      console.log('VideoToAudio error:', error);
      const msg = error?.message || 'Conversion failed. Please try again.';
      triggerToast('Error', msg, 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const shareOutput = async () => {
    if (!outputUri) return;
    await Sharing.shareAsync(outputUri, { mimeType: 'audio/mp4' });
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

  const saveOutput = async () => {
    if (!outputUri) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const filePath = outputUri.replace(/^file:\/\//, '');
      const fileName = audioName.trim() ? `${audioName.trim()}.m4a` : `ToolsApp_Audio_${Date.now()}.m4a`;
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
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={loading}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Video to Audio</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Empty State */}
        {!video && (
          <View style={styles.emptyState}>
            <Ionicons name="videocam" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No video selected</Text>
            <Text style={styles.emptyDesc}>Pick a video file to extract its audio as M4A</Text>
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
          </View>
        )}

        {/* Size Info */}
        {video && (
          <View style={styles.sizeRow}>
            <View style={styles.sizeCard}>
              <Text style={styles.sizeLabel}>Input</Text>
              <Text style={styles.sizeValue}>{formatSize(video.size)}</Text>
            </View>
            <View style={outputSize ? [styles.sizeCard, { backgroundColor: ACCENT + '20', borderColor: ACCENT + '40' }] : styles.sizeCard}>
              <Text style={styles.sizeLabel}>Output</Text>
              <Text style={[styles.sizeValue, outputSize && { color: ACCENT }]}>{formatSize(outputSize)}</Text>
            </View>
          </View>
        )}

        {/* Pick Video Button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickVideo} activeOpacity={0.8} disabled={loading}>
          <Ionicons name="videocam" size={22} color={colors.textPrimary} />
          <Text style={styles.pickBtnText}>{!video ? 'Pick Video' : 'Change Video'}</Text>
        </TouchableOpacity>

        {/* Options */}
        {video && !outputUri && (
          <>
            {/* Rename Button */}
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => {
                setTempAudioName(audioName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              <Text style={styles.optionBtnLabel}>Rename Audio</Text>
              <View style={styles.optionBtnRight}>
                <Text style={styles.optionBtnValue}>
                  {audioName
                    ? (audioName.length > 17 ? audioName.substring(0, 17) + '...' : audioName)
                    : 'Default'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Convert Button */}
            <TouchableOpacity
              style={[styles.convertBtn, loading && styles.btnDisabled]}
              onPress={convertVideo}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="musical-notes" size={22} color="#fff" />
              )}
              <Text style={styles.convertBtnText}>
                {loading ? 'Extracting...' : 'Extract to M4A'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Result Section */}
        {outputUri && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={ACCENT} />
              <Text style={styles.successText}>Audio Extracted!</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveOutput} activeOpacity={0.8} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareOutput} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setOutputUri(null); setOutputSize(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Extract Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Rename Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.renameModalOverlay}>
              <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
              <TouchableWithoutFeedback>
                <View style={styles.renameModalBox}>
                  <Text style={styles.renameModalTitle}>Rename Audio</Text>
                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter audio file name..."
                    placeholderTextColor={colors.textSecondary}
                    value={tempAudioName}
                    onChangeText={setTempAudioName}
                    autoFocus
                  />
                  <View style={styles.renameButtonsContainer}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => { setRenameModalVisible(false); setTempAudioName(audioName); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.renameDoneButton}
                      onPress={() => {
                        setAudioName(tempAudioName.trim());
                        setRenameModalVisible(false);
                        triggerToast(
                          'Success',
                          tempAudioName.trim() === '' ? 'Name reset to default' : 'Audio name updated',
                          'success',
                          2000
                        );
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

const createStyles = (colors, isDark) => StyleSheet.create({
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
  emptyDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 20 },

  previewSection: { marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card },
  preview: { width: '100%', height: 220, borderRadius: 16 },

  sizeRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sizeCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 62,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center',
  },
  sizeLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  sizeValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },

  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.pickBg, borderWidth: 2, borderColor: colors.pickBorder,
    borderStyle: 'dashed', borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
  },
  pickBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

  optionBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 56, borderWidth: 1, borderColor: colors.border,
    padding: 16, paddingVertical: 20, marginTop: 12, gap: 12,
  },
  optionBtnLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  optionBtnRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionBtnValue: { color: ACCENT, fontSize: 14, fontWeight: '600' },

  convertBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
  },
  convertBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { backgroundColor: ACCENT + '80' },

  resultSection: { marginTop: 20 },
  successBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT + '20', borderRadius: 60, borderWidth: 1,
    borderColor: ACCENT + '40', paddingVertical: 14, gap: 10,
  },
  successText: { color: ACCENT, fontSize: 16, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
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
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.retryBg, borderWidth: 1, borderColor: colors.border2,
    borderRadius: 60, paddingVertical: 16, marginTop: 12, gap: 10,
  },
  retryBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

  // Rename Modal
  renameModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  renameModalBox: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 50,
  },
  renameModalTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
  renameInput: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', borderRadius: 16, padding: 16,
    fontSize: 16, color: colors.textPrimary, borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0', marginBottom: 20,
  },
  renameButtonsContainer: { flexDirection: 'row', gap: 12 },
  renameCancelButton: {
    flex: 1, backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    paddingVertical: 16, borderRadius: 60, alignItems: 'center',
  },
  renameCancelButtonText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  renameDoneButton: { flex: 1, backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 60, alignItems: 'center' },
  renameDoneButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

export default VideoToAudio;
