import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Pdf from 'react-native-pdf';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';

const accent = '#E57373';

const ShowPDF = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [pdfUri, setPdfUri] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [password, setPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDir: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setPdfUri(file.uri);
      setPdfName(file.name || 'PDF File');
      setPageCount(0);
      setPassword('');
      setPasswordInput('');
      setNeedsPassword(false);
    } catch (e) {
      triggerToast('Error', 'Failed to pick PDF', 'error', 2000);
    }
  };

  const handleReset = () => {
    setPageCount(0);
    setPassword('');
    setPasswordInput('');
    setNeedsPassword(false);
    setPdfName('');
    // Delay clearing URI so PDF component unmounts cleanly
    setTimeout(() => setPdfUri(null), 100);
  };

  const handlePasswordSubmit = () => {
    if (!passwordInput.trim()) return;
    setPassword(passwordInput.trim());
    setPasswordError('');
    setNeedsPassword(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Show PDF</Text>
      </View>

      {!pdfUri || !pdfName ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyState}>
            <FontAwesome5 name="file-pdf" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Open a PDF</Text>
            <Text style={styles.emptyDesc}>
              Choose a PDF file from your device to view it
            </Text>
          </View>

          <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} activeOpacity={0.8}>
            <Ionicons name="document-outline" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>Choose PDF</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pdfContainer}>
          {/* PDF Info Bar */}
          <View style={styles.infoBar}>
            <View style={styles.infoLeft}>
              <FontAwesome5 name="file-pdf" size={18} color={accent} />
              <Text style={styles.infoName} numberOfLines={1}>{pdfName}</Text>
            </View>
            {pageCount > 0 && (
              <Text style={styles.infoPages}>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</Text>
            )}
          </View>

          {/* Buttons */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.changeBtn} onPress={pickPdf} activeOpacity={0.8}>
              <Ionicons name="swap-horizontal" size={20} color={accent} />
              <Text style={styles.changeBtnText}>Change PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* PDF Viewer */}
          {needsPassword ? (
            <View style={styles.passwordContainer}>
              <Ionicons name="lock-closed" size={48} color={accent} />
              <Text style={styles.passwordTitle}>Password Protected</Text>
              <Text style={styles.passwordDesc}>This PDF requires a password to open</Text>
              <TextInput
                style={[styles.passwordInput, passwordError && styles.passwordInputError]}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                value={passwordInput}
                onChangeText={(t) => { setPasswordInput(t); setPasswordError(''); }}
                secureTextEntry
                autoFocus
                onSubmitEditing={handlePasswordSubmit}
              />
              {passwordError ? (
                <Text style={styles.passwordErrorText}>{passwordError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.passwordBtn, !passwordInput.trim() && { opacity: 0.5 }]}
                onPress={handlePasswordSubmit}
                activeOpacity={0.8}
                disabled={!passwordInput.trim()}
              >
                <Text style={styles.passwordBtnText}>Unlock PDF</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Pdf
              source={{ uri: pdfUri }}
              style={styles.pdfView}
              trustAllCerts={false}
              password={password || undefined}
              onLoadComplete={(numberOfPages) => {
                setPageCount(numberOfPages);
              }}
              onError={(error) => {
                const errMsg = String(error);
                if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('encrypt')) {
                  if (password) {
                    setPasswordError('Incorrect password. Please try again.');
                  }
                  setNeedsPassword(true);
                } else {
                  console.log('PDF Error:', error);
                  triggerToast('Error', 'Failed to load PDF', 'error', 2000);
                }
              }}
              renderActivityIndicator={() => (
                <View style={styles.pdfLoading}>
                  <ActivityIndicator size="large" color={accent} />
                  <Text style={styles.pdfLoadingText}>Loading PDF...</Text>
                </View>
              )}
            />
          )}

          {/* Bottom spacer */}
          <View style={{ height: 100 }} />
        </View>
      )}
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

    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 40,
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
    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: accent,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 60,
    },
    pickBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },

    pdfContainer: {
      flex: 1,
    },
    infoBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : '#e0e0e0',
    },
    infoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 12,
    },
    infoName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    infoPages: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },

    pdfView: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    pdfLoading: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg,
    },
    pdfLoadingText: {
      marginTop: 12,
      fontSize: 16,
      color: colors.textPrimary,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : '#e0e0e0',
    },
    changeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: accent + '20',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 60,
      borderWidth: 1,
      borderColor: accent + '50',
    },
    changeBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: accent,
    },
    closeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 60,
    },
    closeBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },

    passwordContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      marginBottom: 200,
    },
    passwordTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 16,
    },
    passwordDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 6,
      marginBottom: 24,
    },
    passwordInput: {
      width: '100%',
      backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#ddd',
      marginBottom: 16,
    },
    passwordInputError: {
      borderColor: '#E53935',
    },
    passwordErrorText: {
      color: '#E53935',
      fontSize: 13,
      fontWeight: '600',
      marginTop: -8,
      marginBottom: 16,
      alignSelf: 'flex-start',
    },
    passwordBtn: {
      backgroundColor: accent,
      paddingVertical: 14,
      paddingHorizontal: 40,
      borderRadius: 60,
    },
    passwordBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });

export default ShowPDF;
