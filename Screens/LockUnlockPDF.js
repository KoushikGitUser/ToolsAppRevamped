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
  PermissionsAndroid,
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { isPdfLocked, lockPdf, unlockPdf } from '../modules/pdf-tools';

const ACCENT = '#1E88E5';

const LockUnlockPDF = ({ navigation }) => {
  const [pdf, setPdf] = useState(null);
  const [isLocked, setIsLocked] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [outputUri, setOutputUri] = useState(null);
  const [outputSize, setOutputSize] = useState(null);
  const [action, setAction] = useState(null); // 'locked' or 'unlocked'
  const [saving, setSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [pdfName, setPdfName] = useState('');
  const [tempPdfName, setTempPdfName] = useState('');

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        const inputPath = asset.uri.replace(/^file:\/\//, '');

        setPdf({ uri: asset.uri, name: asset.name, size: asset.size });
        setPassword('');
        setConfirmPassword('');
        setOutputUri(null);
        setOutputSize(null);
        setAction(null);
        setIsLocked(null);

        // Check lock status
        setChecking(true);
        try {
          const status = await isPdfLocked(inputPath);
          setIsLocked(status.locked);
        } catch {
          setIsLocked(false);
        } finally {
          setChecking(false);
        }
      }
    } catch {
      triggerToast('Error', 'Failed to pick PDF file', 'error', 2500);
    }
  };

  const doLock = async () => {
    if (!pdf || !password) {
      triggerToast('Warning', 'Enter a password to lock the PDF', 'alert', 2500);
      return;
    }
    if (password !== confirmPassword) {
      triggerToast('Warning', 'Passwords do not match', 'alert', 2500);
      return;
    }
    if (password.length < 4) {
      triggerToast('Warning', 'Password must be at least 4 characters', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const inputPath = pdf.uri.replace(/^file:\/\//, '');
      const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1);
      const outputPath = `${inputDir}Locked_ToolsApp.pdf`;

      const result = await lockPdf(inputPath, password, outputPath);

      setOutputUri(`file://${result.path}`);
      setOutputSize(result.size || null);
      setAction('locked');
      triggerToast('Done', 'PDF locked with password!', 'success', 2500);
    } catch (error) {
      console.log('LockPDF error:', error);
      triggerToast('Error', error?.message || 'Lock failed', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const doUnlock = async () => {
    if (!pdf || !password) {
      triggerToast('Warning', 'Enter the password to unlock', 'alert', 2500);
      return;
    }

    setLoading(true);
    try {
      const inputPath = pdf.uri.replace(/^file:\/\//, '');
      const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1);
      const outputPath = `${inputDir}Unlocked_ToolsApp.pdf`;

      const result = await unlockPdf(inputPath, password, outputPath);

      setOutputUri(`file://${result.path}`);
      setOutputSize(result.size || null);
      setAction('unlocked');
      triggerToast('Done', 'PDF unlocked successfully!', 'success', 2500);
    } catch (error) {
      console.log('UnlockPDF error:', error);
      if (error?.code === 'ERR_WRONG_PASSWORD' || error?.message?.includes('password')) {
        triggerToast('Error', 'Incorrect password', 'error', 3000);
      } else {
        triggerToast('Error', error?.message || 'Unlock failed', 'error', 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  const shareOutput = async () => {
    if (!outputUri) return;
    await Sharing.shareAsync(outputUri, { mimeType: 'application/pdf' });
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
      const fileName = pdfName.trim()
        ? `${pdfName.trim()}.pdf`
        : `ToolsApp_${action === 'locked' ? 'Locked' : 'Unlocked'}_${Date.now()}.pdf`;
      await saveToDownloads(filePath, fileName, 'application/pdf');
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
        <Text style={styles.heading}>Lock/Unlock PDF</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!pdf && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-lock" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Lock / Unlock PDF</Text>
            <Text style={styles.emptyDesc}>Password protect a PDF or remove password from a locked PDF</Text>
          </View>
        )}

        {/* Selected PDF Info */}
        {pdf && (
          <View style={styles.pdfInfoCard}>
            <FontAwesome5 name="file-pdf" size={32} color={ACCENT} />
            <View style={styles.pdfInfoText}>
              <Text style={styles.pdfInfoName} numberOfLines={1}>{pdf.name}</Text>
              <View style={styles.pdfInfoRow}>
                <Text style={styles.pdfInfoMeta}>{formatSize(pdf.size)}</Text>
                {checking ? (
                  <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 8 }} />
                ) : isLocked !== null && (
                  <View style={[styles.lockBadge, { backgroundColor: isLocked ? '#FF5252' + '20' : '#4CAF50' + '20' }]}>
                    <MaterialCommunityIcons
                      name={isLocked ? 'lock' : 'lock-open'}
                      size={14}
                      color={isLocked ? '#FF5252' : '#4CAF50'}
                    />
                    <Text style={[styles.lockBadgeText, { color: isLocked ? '#FF5252' : '#4CAF50' }]}>
                      {isLocked ? 'Locked' : 'Unlocked'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Password Input Section */}
        {pdf && isLocked !== null && !outputUri && (
          <View style={styles.passwordSection}>
            <Text style={styles.sectionTitle}>
              {isLocked ? 'Enter Password to Unlock' : 'Set Password to Lock'}
            </Text>

            <View style={styles.inputContainer}>
              <MaterialCommunityIcons
                name="lock"
                size={20}
                color={colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder={isLocked ? 'Enter PDF password' : 'Enter new password'}
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Confirm password only for locking */}
            {!isLocked && (
              <View style={[styles.inputContainer, { marginTop: 10 }]}>
                <MaterialCommunityIcons
                  name="lock-check"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            {/* Password strength hint for locking */}
            {!isLocked && password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={[styles.strengthBar, { backgroundColor: colors.border }]}>
                  <View style={[
                    styles.strengthFill,
                    {
                      width: password.length < 4 ? '25%' : password.length < 8 ? '50%' : password.length < 12 ? '75%' : '100%',
                      backgroundColor: password.length < 4 ? '#FF5252' : password.length < 8 ? '#FF9800' : '#4CAF50',
                    }
                  ]} />
                </View>
                <Text style={[styles.strengthText, {
                  color: password.length < 4 ? '#FF5252' : password.length < 8 ? '#FF9800' : '#4CAF50',
                }]}>
                  {password.length < 4 ? 'Too short' : password.length < 8 ? 'Fair' : 'Strong'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Size Info */}
        {outputUri && (
          <View style={styles.sizeRow}>
            <View style={styles.sizeCard}>
              <Text style={styles.sizeLabel}>Input</Text>
              <Text style={styles.sizeValue}>{formatSize(pdf?.size)}</Text>
            </View>
            <View style={[styles.sizeCard, { backgroundColor: ACCENT + '20', borderColor: ACCENT + '40' }]}>
              <Text style={styles.sizeLabel}>Output</Text>
              <Text style={[styles.sizeValue, { color: ACCENT }]}>{formatSize(outputSize)}</Text>
            </View>
          </View>
        )}

        {/* Pick Button */}
        {!outputUri && (
          <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} activeOpacity={0.8} disabled={loading}>
            <FontAwesome5 name="file-pdf" size={20} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>{!pdf ? 'Pick PDF File' : 'Change PDF'}</Text>
          </TouchableOpacity>
        )}

        {/* Lock / Unlock Button */}
        {pdf && isLocked !== null && password.length > 0 && !outputUri && (
          <TouchableOpacity
            style={[styles.actionBtn, loading && styles.btnDisabled]}
            onPress={isLocked ? doUnlock : doLock}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialCommunityIcons
                name={isLocked ? 'lock-open' : 'lock'}
                size={22}
                color="#fff"
              />
            )}
            <Text style={styles.actionBtnText}>
              {loading
                ? (isLocked ? 'Unlocking...' : 'Locking...')
                : (isLocked ? 'Unlock PDF' : 'Lock PDF')
              }
            </Text>
          </TouchableOpacity>
        )}

        {/* Result Section */}
        {outputUri && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={ACCENT} />
              <Text style={styles.successText}>
                PDF {action === 'locked' ? 'Locked' : 'Unlocked'}!
              </Text>
            </View>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => {
                setTempPdfName(pdfName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={loading || saving}
            >
              <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              <Text style={styles.renameBtnLabel}>Rename PDF</Text>
              <View style={styles.renameBtnRight}>
                <Text style={styles.renameBtnValue}>
                  {pdfName
                    ? (pdfName.length > 17 ? pdfName.substring(0, 17) + '...' : pdfName)
                    : 'Default'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

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
              onPress={() => {
                setOutputUri(null);
                setOutputSize(null);
                setAction(null);
                setPassword('');
                setConfirmPassword('');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Do Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Rename PDF Modal */}
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
                  <Text style={styles.renameModalTitle}>Rename PDF</Text>

                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter PDF name..."
                    placeholderTextColor={colors.textSecondary}
                    value={tempPdfName}
                    onChangeText={setTempPdfName}
                    autoFocus
                  />

                  <View style={styles.renameButtonsContainer}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => {
                        setRenameModalVisible(false);
                        setTempPdfName(pdfName);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.renameDoneButton}
                      onPress={() => {
                        if (tempPdfName.trim() === '') {
                          triggerToast('Error', 'Please enter a name for the PDF', 'error', 2000);
                          return;
                        }
                        setPdfName(tempPdfName);
                        setRenameModalVisible(false);
                        triggerToast('Success', 'PDF name updated', 'success', 2000);
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
      flexDirection: 'row', alignItems: 'center',
      marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
      paddingHorizontal: 20, marginBottom: 10,
    },
    backBtn: { marginRight: 12 },
    heading: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.textTertiary, marginTop: 20 },
    emptyDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 20 },

    pdfInfoCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
      borderRadius: 20, borderWidth: 1, borderColor: ACCENT + '40',
      padding: 18, marginTop: 16, gap: 14,
    },
    pdfInfoText: { flex: 1 },
    pdfInfoName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    pdfInfoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pdfInfoMeta: { fontSize: 13, color: colors.textSecondary },
    lockBadge: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
      paddingVertical: 3, borderRadius: 10, marginLeft: 10, gap: 4,
    },
    lockBadgeText: { fontSize: 12, fontWeight: '700' },

    passwordSection: { marginTop: 20 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },

    inputContainer: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
      borderRadius: 16, borderWidth: 1, borderColor: ACCENT + '40',
      paddingHorizontal: 14, height: 52,
    },
    inputIcon: { marginRight: 10 },
    textInput: {
      flex: 1, fontSize: 16, color: colors.textPrimary,
      paddingVertical: 0,
    },
    eyeBtn: { padding: 6 },

    strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
    strengthBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
    strengthFill: { height: '100%', borderRadius: 2 },
    strengthText: { fontSize: 12, fontWeight: '600' },

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

    actionBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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

export default LockUnlockPDF;
