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
  PermissionsAndroid,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import * as DocumentPicker from 'expo-document-picker';
import { Paths } from 'expo-file-system';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import { convertToMp4 } from '../modules/video-converter';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#FF6D00';

const VideoConverter = ({ navigation }) => {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [videoName, setVideoName] = useState('');
  const [tempVideoName, setTempVideoName] = useState('');

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickVideo = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['video/x-matroska', 'video/quicktime', 'video/webm', 'video/avi', 'video/*'],
      copyToCacheDirectory: true,
    });

    if (!res.canceled && res.assets?.length > 0) {
      const asset = res.assets[0];
      setVideo({ uri: asset.uri, name: asset.name, size: asset.size });
      setResult(null);
    }
  };

  const handleConvert = async () => {
    if (!video) return;
    setLoading(true);
    try {
      const inputPath = video.uri.replace(/^file:\/\//, '');
      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const baseName = video.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\- ]/g, '_');
      const outputPath = `${cacheDir}/${baseName}_converted_${Date.now()}.mp4`;

      const res = await convertToMp4(inputPath, outputPath);
      setResult(res);
      triggerToast('Converted', 'Video converted to MP4 successfully', 'success', 2500);
    } catch (e) {
      console.error('Convert error:', e);
      triggerToast('Error', e.message || 'Failed to convert video', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const requestStoragePermission = async () => {
    if (Platform.OS !== 'android' || Platform.Version >= 29) return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) return;
      const baseName = video.name.replace(/\.[^/.]+$/, '');
      const fileName = videoName.trim() ? `${videoName.trim()}.mp4` : `${baseName}_converted.mp4`;
      await saveToDownloads(result.path, fileName, 'video/mp4');
      triggerToast('Saved', 'Video saved to Downloads', 'success', 2500);
    } catch (e) {
      console.error('Save error:', e);
      triggerToast('Error', 'Failed to save video', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({ url: `file://${result.path}`, title: 'Share Video' });
    } catch (e) {
      console.error('Share error:', e);
    }
  };

  const handleReset = () => {
    setVideo(null);
    setResult(null);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Video Converter</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!video && !result && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-video-outline" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Convert to MP4</Text>
            <Text style={styles.emptyDesc}>
              Pick a MKV, MOV, or WebM video file to convert it to MP4 format
            </Text>
          </View>
        )}

        {/* Pick Button */}
        {!result && (
          <TouchableOpacity
            style={styles.pickBtn}
            onPress={pickVideo}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="videocam" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>
              {video ? 'Pick Another Video' : 'Pick Video File'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Selected File Info */}
        {video && !result && (
          <View style={styles.fileInfo}>
            <View style={styles.fileIconBg}>
              <MaterialCommunityIcons name="file-video" size={28} color={ACCENT} />
            </View>
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={2}>{video.name}</Text>
              <Text style={styles.fileSize}>{formatSize(video.size)}</Text>
            </View>
          </View>
        )}

        {/* Convert Button */}
        {video && !result && (
          <TouchableOpacity
            style={[styles.convertBtn, loading && { opacity: 0.6 }]}
            onPress={handleConvert}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="repeat" size={20} color="#fff" />
            )}
            <Text style={styles.convertBtnText}>
              {loading ? 'Converting...' : 'Convert to MP4'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultContainer}>
            <View style={styles.resultIcon}>
              <MaterialCommunityIcons name="file-video" size={64} color={ACCENT} />
            </View>
            <Text style={styles.resultTitle}>Converted!</Text>
            <Text style={styles.resultSub}>
              {formatSize(video.size)} → {formatSize(result.size)}
            </Text>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => {
                setTempVideoName(videoName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={saving}
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
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareBtn}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Convert Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

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
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.textTertiary, marginTop: 20 },
    emptyDesc: {
      fontSize: 14, color: colors.textMuted, textAlign: 'center',
      marginTop: 8, lineHeight: 20, paddingHorizontal: 20,
    },

    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 20,
      gap: 10,
    },
    pickBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    fileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderRadius: 20,
      padding: 16,
      marginTop: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
      gap: 14,
    },
    fileIconBg: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: ACCENT + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileDetails: { flex: 1 },
    fileName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    fileSize: { fontSize: 13, color: colors.textMuted, marginTop: 4 },

    convertBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      borderRadius: 60,
      paddingVertical: 18,
      marginTop: 24,
      gap: 10,
    },
    convertBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    resultContainer: { alignItems: 'center', paddingTop: 40 },
    resultIcon: {
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: ACCENT + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    resultTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
    resultSub: { fontSize: 14, color: colors.textSecondary, marginBottom: 32 },

    actionRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
    saveBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.saveBtnBg,
      borderRadius: 60,
      paddingVertical: 16,
      gap: 8,
    },
    saveBtnText: { color: colors.saveBtnText, fontSize: 16, fontWeight: '700' },
    shareBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shareBtnBg,
      borderRadius: 60,
      paddingVertical: 16,
      gap: 8,
    },
    shareBtnText: { color: colors.shareBtnText, fontSize: 16, fontWeight: '700' },

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
    retryBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },

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
      marginTop: 0,
      marginBottom: 12,
      width: '100%',
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
      color: ACCENT,
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
      backgroundColor: ACCENT,
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

export default VideoConverter;
