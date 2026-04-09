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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Paths } from 'expo-file-system';
import { unzipWithPassword, isZipEncrypted } from '../modules/zip-tools';

const ACCENT = '#2E7D32';

const UnzipLockedZip = ({ navigation }) => {
  const [zip, setZip] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickZip = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets?.length > 0) {
        const asset = res.assets[0];
        setZip({ uri: asset.uri, name: asset.name, size: asset.size });
        setPassword('');
        setResult(null);
        setIsEncrypted(null);

        setChecking(true);
        try {
          const status = await isZipEncrypted(asset.uri);
          setIsEncrypted(status.encrypted);
        } catch {
          setIsEncrypted(null);
        } finally {
          setChecking(false);
        }
      }
    } catch {
      triggerToast('Error', 'Failed to pick ZIP file', 'error', 2500);
    }
  };

  const extractZip = async () => {
    if (!zip) return;
    if (isEncrypted && !password) {
      triggerToast('Warning', 'Please enter the password', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const cachePath = Paths.cache.uri.replace(/^file:\/\//, '');
      const outputDir = `${cachePath}/unzip_${Date.now()}`;

      const res = await unzipWithPassword(zip.uri, password || '', outputDir);
      setResult(res);
      triggerToast('Success', `Extracted ${res.fileCount} files`, 'success', 2500);
    } catch (e) {
      console.log('Unzip error:', e);
      const msg = e?.message || '';
      if (msg.includes('Wrong password') || msg.includes('Incorrect password')) {
        triggerToast('Error', 'Incorrect password', 'error', 2500);
      } else {
        triggerToast('Error', 'Failed to extract ZIP', 'error', 2500);
      }
    } finally {
      setLoading(false);
    }
  };

  const shareFile = async (path) => {
    try {
      await Sharing.shareAsync('file://' + path, {
        dialogTitle: 'Share File',
      });
    } catch {
      triggerToast('Error', 'Failed to share', 'error', 2500);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const reset = () => {
    setZip(null);
    setPassword('');
    setResult(null);
    setIsEncrypted(null);
  };

  const getFileIcon = (name) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'file-image';
    if (['pdf'].includes(ext)) return 'file-pdf-box';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'file-document';
    if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return 'file-music';
    if (['mp4', 'avi', 'mkv', 'mov'].includes(ext)) return 'file-video';
    return 'file-outline';
  };

  return (
    <View style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Unzip Locked ZIP</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Empty State */}
        {!zip && !result && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="folder-zip-outline" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Extract Locked ZIP</Text>
            <Text style={styles.emptyDesc}>Select a password-protected ZIP file to extract its contents</Text>
          </View>
        )}

        {/* Pick ZIP Button */}
        {!result && (
          <TouchableOpacity style={[styles.pickBtn, loading && styles.actionBtnDisabled]} onPress={pickZip} activeOpacity={0.85} disabled={loading}>
            <MaterialCommunityIcons name="folder-zip" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>{zip ? 'Change ZIP File' : 'Select ZIP File'}</Text>
          </TouchableOpacity>
        )}

        {/* ZIP Info Card */}
        {zip && !result && (
          <View style={styles.zipCard}>
            <MaterialCommunityIcons name="folder-zip" size={32} color={ACCENT} />
            <View style={styles.zipInfo}>
              <Text style={styles.zipName} numberOfLines={1}>{zip.name}</Text>
              <Text style={styles.zipSize}>{formatSize(zip.size)}</Text>
            </View>
            {checking ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : isEncrypted !== null && (
              <View style={[styles.badge, { backgroundColor: isEncrypted ? '#FF5252' + '20' : ACCENT + '20' }]}>
                <MaterialCommunityIcons
                  name={isEncrypted ? 'lock' : 'lock-open'}
                  size={14}
                  color={isEncrypted ? '#FF5252' : ACCENT}
                />
                <Text style={[styles.badgeText, { color: isEncrypted ? '#FF5252' : ACCENT }]}>
                  {isEncrypted ? 'Locked' : 'Open'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Password Input */}
        {zip && !result && isEncrypted && (
          <View style={styles.passwordSection}>
            <Text style={styles.sectionTitle}>Enter Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="ZIP password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Extract Button */}
        {zip && !result && (
          <TouchableOpacity
            style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
            onPress={extractZip}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="zip-box-outline" size={20} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>{loading ? 'Extracting...' : 'Extract Files'}</Text>
          </TouchableOpacity>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultSection}>
            <View style={styles.resultHeader}>
              <MaterialCommunityIcons name="check-circle" size={48} color={ACCENT} />
              <Text style={styles.resultTitle}>Extracted!</Text>
              <Text style={styles.resultInfo}>{result.fileCount} file{result.fileCount !== 1 ? 's' : ''} extracted</Text>
            </View>

            <ScrollView style={styles.fileScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
              {result.names.map((name, index) => (
                <View key={index} style={styles.fileItem}>
                  <MaterialCommunityIcons name={getFileIcon(name)} size={22} color={ACCENT} />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.fileSize}>{formatSize(result.sizes[index])}</Text>
                  </View>
                  <TouchableOpacity onPress={() => shareFile(result.paths[index])} style={[styles.shareBtn, { backgroundColor: isDark ? '#fff' : '#000' }]}>
                    <Ionicons name="share" size={18} color={isDark ? '#000' : '#fff'} />
                    <Text style={[styles.shareBtnText, { color: isDark ? '#000' : '#fff' }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={reset} activeOpacity={0.85}>
              <Ionicons name="refresh" size={20} color={ACCENT} />
              <Text style={[styles.actionBtnText, { color: ACCENT }]}>Extract again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

    zipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 56,
      padding: 14,
      paddingHorizontal: 18,
      marginBottom: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: ACCENT + '40',
    },
    zipInfo: { flex: 1 },
    zipName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    zipSize: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    badgeText: { fontSize: 12, fontWeight: '700' },

    passwordSection: { marginBottom: 20 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 56,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
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

    resetBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: ACCENT,
      marginTop: 10,
    },

    resultSection: { marginTop: 10 },
    fileScroll: { maxHeight: 350 },
    resultHeader: {
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
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    shareBtnText: { fontSize: 12, fontWeight: '700' },
  });

export default UnzipLockedZip;
