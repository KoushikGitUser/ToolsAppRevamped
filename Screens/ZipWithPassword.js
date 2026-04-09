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
  TextInput,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Paths } from 'expo-file-system';
import { createZipWithPassword, saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#FF6F00';

const ZipWithPassword = ({ navigation }) => {
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [zipName, setZipName] = useState('');
  const [tempZipName, setTempZipName] = useState('');

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets?.length > 0) {
        const newFiles = res.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          size: a.size,
        }));
        const combined = [...files, ...newFiles];
        if (combined.length > 50) {
          triggerToast('Limit', 'Maximum 50 files allowed', 'alert', 2500);
          setFiles(combined.slice(0, 50));
        } else {
          setFiles(combined);
        }
        setResult(null);
      }
    } catch {
      triggerToast('Error', 'Failed to pick files', 'error', 2500);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const createZip = async () => {
    if (files.length === 0) {
      triggerToast('Warning', 'Please select files first', 'alert', 2500);
      return;
    }
    if (!password) {
      triggerToast('Warning', 'Please enter a password', 'alert', 2500);
      return;
    }
    if (password !== confirmPassword) {
      triggerToast('Warning', 'Passwords do not match', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const cachePath = Paths.cache.uri.replace(/^file:\/\//, '');
      const outputPath = `${cachePath}/ToolsApp_Protected_${Date.now()}.zip`;
      const filePaths = files.map((f) => f.uri);
      const fileNames = files.map((f) => f.name);

      const res = await createZipWithPassword(filePaths, fileNames, password, outputPath);
      setResult(res);
      triggerToast('Success', 'ZIP created successfully', 'success', 2500);
    } catch (e) {
      console.log('ZIP error:', e);
      triggerToast('Error', 'Failed to create ZIP file', 'error', 2500);
    } finally {
      setLoading(false);
    }
  };

  const shareZip = async () => {
    if (!result?.path) return;
    try {
      await Sharing.shareAsync('file://' + result.path, {
        mimeType: 'application/zip',
        dialogTitle: 'Share ZIP',
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

  const saveZip = async () => {
    if (!result?.path) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const fileName = zipName.trim() ? `${zipName.trim()}.zip` : `ToolsApp_Protected_${Date.now()}.zip`;
      await saveToDownloads(result.path, fileName, 'application/zip');
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
    setFiles([]);
    setPassword('');
    setConfirmPassword('');
    setResult(null);
  };

  return (
    <View style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Create Locked ZIP</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Empty State */}
        {files.length === 0 && !result && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="folder-zip" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Create Locked ZIP</Text>
            <Text style={styles.emptyDesc}>Select files to create a password-protected ZIP archive</Text>
          </View>
        )}

        {/* Pick Files Button */}
        {!result && (
          <TouchableOpacity style={[styles.pickBtn, loading && styles.actionBtnDisabled]} onPress={pickFiles} activeOpacity={0.85} disabled={loading}>
            <MaterialCommunityIcons name="file-plus" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>
              {files.length === 0 ? 'Select Files' : 'Add More Files'}
            </Text>
          </TouchableOpacity>
        )}

        {/* File List */}
        {files.length > 0 && !result && (
          <View style={styles.fileList}>
            <Text style={styles.sectionTitle}>{files.length} file{files.length !== 1 ? 's' : ''} selected</Text>
            <ScrollView style={styles.fileScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
              {files.map((file, index) => (
                <View key={index} style={styles.fileItem}>
                  <MaterialCommunityIcons name="file-outline" size={20} color={ACCENT} />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.fileSize}>{formatSize(file.size)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFile(index)} disabled={loading} style={loading && { opacity: 0.4 }}>
                    <Ionicons name="close-circle" size={22} color="#FF5252" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Password Input */}
        {files.length > 0 && !result && (
          <View style={styles.passwordSection}>
            <Text style={styles.sectionTitle}>Set Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>
          </View>
        )}

        {/* Create Button */}
        {files.length > 0 && !result && (
          <TouchableOpacity
            style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
            onPress={createZip}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="lock" size={20} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>{loading ? 'Creating ZIP...' : 'Create Protected ZIP'}</Text>
          </TouchableOpacity>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultSection}>
            <View style={styles.resultCard}>
              <MaterialCommunityIcons name="folder-zip" size={48} color={ACCENT} />
              <Text style={styles.resultTitle}>ZIP Created!</Text>
              <Text style={styles.resultInfo}>{result.fileCount} files • {formatSize(result.size)}</Text>
            </View>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => {
                setTempZipName(zipName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={loading || saving}
            >
              <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              <Text style={styles.renameBtnLabel}>Rename ZIP</Text>
              <View style={styles.renameBtnRight}>
                <Text style={styles.renameBtnValue}>
                  {zipName
                    ? (zipName.length > 17 ? zipName.substring(0, 17) + '...' : zipName)
                    : 'Default'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveZip} activeOpacity={0.8} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareZip} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={reset} activeOpacity={0.85}>
              <Ionicons name="refresh" size={20} color={ACCENT} />
              <Text style={[styles.actionBtnText, { color: ACCENT }]}>Create again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>

    {/* Rename ZIP Modal */}
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
                <Text style={styles.renameModalTitle}>Rename ZIP</Text>

                <TextInput
                  style={styles.renameInput}
                  placeholder="Enter ZIP name..."
                  placeholderTextColor={colors.textSecondary}
                  value={tempZipName}
                  onChangeText={setTempZipName}
                  autoFocus
                />

                <View style={styles.renameButtonsContainer}>
                  <TouchableOpacity
                    style={styles.renameCancelButton}
                    onPress={() => {
                      setRenameModalVisible(false);
                      setTempZipName(zipName);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.renameCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.renameDoneButton}
                    onPress={() => {
                      if (tempZipName.trim() === '') {
                        triggerToast('Error', 'Please enter a name for the ZIP', 'error', 2000);
                        return;
                      }
                      setZipName(tempZipName);
                      setRenameModalVisible(false);
                      triggerToast('Success', 'ZIP name updated', 'success', 2000);
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
    heading: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

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
      borderRadius: 56,
      padding: 16,
      gap: 10,
      marginBottom: 20,
    },
    pickBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    fileList: { marginBottom: 20 },
    fileScroll: { maxHeight: 300 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    fileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 56,
      padding: 14,
      paddingHorizontal: 18,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    fileInfo: { flex: 1 },
    fileName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    fileSize: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

    passwordSection: { marginBottom: 20 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 56,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
      marginBottom: 10,
    },
    input: {
      flex: 1,
      padding: 16,
      fontSize: 15,
      color: colors.textPrimary,
    },
    eyeBtn: { paddingHorizontal: 14 },

    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      borderRadius: 56,
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
      padding: 30,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: ACCENT + '40',
    },
    resultTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: 14 },
    resultInfo: { fontSize: 14, color: colors.textMuted, marginTop: 6 },

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
      marginBottom: 12,
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

export default ZipWithPassword;
