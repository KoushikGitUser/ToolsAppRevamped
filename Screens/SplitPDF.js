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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import Pdf from 'react-native-pdf';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getPdfInfo, splitPdf, isPdfLocked } from '../modules/pdf-tools';

const ACCENT = '#FF6D00';

const SplitPDF = ({ navigation }) => {
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [splitResults, setSplitResults] = useState(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [pdfName, setPdfName] = useState('');
  const [tempPdfName, setTempPdfName] = useState('');
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);

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

        // Check if PDF is locked
        let locked = false;
        try {
          const lockStatus = await isPdfLocked(inputPath);
          locked = lockStatus.locked;
        } catch {}

        if (locked) {
          triggerToast('Locked PDF', 'This PDF is password protected. Unlock it first using Lock/Unlock PDF tool.', 'error', 3500);
          return;
        }

        let pageCount = null;
        try {
          const info = await getPdfInfo(inputPath);
          pageCount = info.pageCount;
        } catch {}

        setPdf({ uri: asset.uri, name: asset.name, size: asset.size, pageCount });
        setSplitResults(null);
      }
    } catch {
      triggerToast('Error', 'Failed to pick PDF file', 'error', 2500);
    }
  };

  const doSplit = async () => {
    if (!pdf) return;
    setLoading(true);
    try {
      const inputPath = pdf.uri.replace(/^file:\/\//, '');
      const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1);
      const outputDir = `${inputDir}split_output/`;
      const baseName = pdfName.trim() || pdf.name.replace(/\.pdf$/i, '') || 'split';

      const result = await splitPdf(inputPath, outputDir, baseName);

      setSplitResults({
        paths: result.paths,
        sizes: result.sizes,
        pageCount: result.pageCount,
      });
      triggerToast('Done', `Split into ${result.pageCount} pages!`, 'success', 2500);
    } catch (error) {
      console.log('SplitPDF error:', error);
      triggerToast('Error', error?.message || 'Split failed', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const sharePage = async (index) => {
    if (!splitResults) return;
    const path = splitResults.paths[index];
    await Sharing.shareAsync(`file://${path}`, { mimeType: 'application/pdf' });
  };

  const shareAll = async () => {
    if (!splitResults || splitResults.paths.length === 0) return;
    // Share first page as a starting point (Sharing API supports single file)
    // User can use "Save / Share All" to share individual ones
    await Sharing.shareAsync(`file://${splitResults.paths[0]}`, { mimeType: 'application/pdf' });
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
        <Text style={styles.heading}>Split PDF</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!pdf && (
          <View style={styles.emptyState}>
            <FontAwesome5 name="file-pdf" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Split PDF</Text>
            <Text style={styles.emptyDesc}>Select a PDF file to split it into individual pages</Text>
          </View>
        )}

        {/* Selected PDF Info */}
        {pdf && !splitResults && (
          <View style={styles.pdfInfoCard}>
            <FontAwesome5 name="file-pdf" size={32} color={ACCENT} />
            <View style={styles.pdfInfoText}>
              <Text style={styles.pdfInfoName} numberOfLines={1}>{pdf.name}</Text>
              <Text style={styles.pdfInfoMeta}>
                {pdf.pageCount ? `${pdf.pageCount} pages` : ''}{pdf.pageCount && pdf.size ? ' · ' : ''}{formatSize(pdf.size)}
              </Text>
            </View>
          </View>
        )}

        {/* Pick Button */}
        {!splitResults && (
          <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} activeOpacity={0.8} disabled={loading}>
            <FontAwesome5 name="file-pdf" size={20} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>{!pdf ? 'Pick PDF File' : 'Change PDF'}</Text>
          </TouchableOpacity>
        )}

        {/* Rename Button */}
        {pdf && !splitResults && (
          <TouchableOpacity
            style={styles.renameBtn}
            onPress={() => {
              setTempPdfName(pdfName);
              setRenameModalVisible(true);
            }}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Ionicons name="pencil" size={20} color={colors.textPrimary} />
            <Text style={styles.renameBtnLabel}>Rename Pages</Text>
            <View style={styles.renameBtnRight}>
              <Text style={styles.renameBtnValue}>
                {pdfName
                  ? (pdfName.length > 17 ? pdfName.substring(0, 17) + '...' : pdfName)
                  : 'Default'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        )}

        {/* Split Button */}
        {pdf && !splitResults && (
          <TouchableOpacity
            style={[styles.splitBtn, loading && styles.btnDisabled]}
            onPress={doSplit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="cut" size={22} color="#fff" />
            )}
            <Text style={styles.splitBtnText}>{loading ? 'Splitting...' : 'Split into Pages'}</Text>
          </TouchableOpacity>
        )}

        {/* Split Results */}
        {splitResults && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={ACCENT} />
              <Text style={styles.successText}>Split into {splitResults.pageCount} pages!</Text>
            </View>

            {/* Page List */}
            <View style={styles.pageList}>
              {splitResults.paths.map((path, index) => {
                const fileName = path.substring(path.lastIndexOf('/') + 1);
                return (
                  <TouchableOpacity key={index} style={styles.pageItem} onPress={() => { setViewerUri(`file://${path}`); setPdfViewerVisible(true); }} activeOpacity={0.7}>
                    <FontAwesome5 name="file-pdf" size={18} color={ACCENT} />
                    <View style={styles.pageItemInfo}>
                      <Text style={styles.pageItemName} numberOfLines={1}>{fileName}</Text>
                      <Text style={styles.pageItemSize}>{formatSize(splitResults.sizes[index])}</Text>
                    </View>
                    <TouchableOpacity onPress={() => sharePage(index)} style={styles.pageShareBtn}>
                      <Ionicons name="share-outline" size={20} color={ACCENT} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={shareAll} activeOpacity={0.8}>
              <Ionicons name="share" size={20} color={colors.shareBtnText} />
              <Text style={styles.shareBtnText}>Share First Page</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setSplitResults(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Split Again</Text>
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
              <BlurView blurType={isDark ? 'dark' : 'light'} blurAmount={10} style={StyleSheet.absoluteFillObject} />
              <TouchableWithoutFeedback>
                <View style={styles.renameModalBox}>
                  <Text style={styles.renameModalTitle}>Rename Pages</Text>
                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter base name for pages..."
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
                          triggerToast('Error', 'Please enter a name', 'error', 2000);
                          return;
                        }
                        setPdfName(tempPdfName);
                        setRenameModalVisible(false);
                        triggerToast('Success', 'Page name updated', 'success', 2000);
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

      {/* PDF Viewer Modal */}
      <Modal
        visible={pdfViewerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setPdfViewerVisible(false)}
      >
        <View style={styles.pdfViewerContainer}>
          <View style={styles.pdfViewerHeader}>
            <Text style={styles.pdfViewerTitle}>PDF Preview</Text>
            <TouchableOpacity onPress={() => setPdfViewerVisible(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {pdfViewerVisible && viewerUri ? (
            <Pdf
              source={{ uri: viewerUri }}
              style={styles.pdfView}
              trustAllCerts={false}
              onError={(error) => {
                console.log('PDF Error:', error);
                triggerToast('Error', 'Failed to load PDF', 'error', 2000);
              }}
              renderActivityIndicator={() => (
                <View style={styles.pdfLoading}>
                  <ActivityIndicator size="large" color={ACCENT} />
                  <Text style={styles.pdfLoadingText}>Loading PDF...</Text>
                </View>
              )}
            />
          ) : null}
        </View>
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
    pdfInfoMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

    pickBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.pickBg, borderWidth: 2, borderColor: colors.pickBorder,
      borderStyle: 'dashed', borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    pickBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

    splitBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    splitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    btnDisabled: { backgroundColor: ACCENT + '80' },

    resultSection: { marginTop: 20 },
    successBadge: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT + '20', borderRadius: 60, borderWidth: 1,
      borderColor: ACCENT + '40', paddingVertical: 14, gap: 10,
    },
    successText: { color: ACCENT, fontSize: 16, fontWeight: '700' },

    pageList: { marginTop: 16 },
    pageItem: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 8, gap: 12,
    },
    pageItemInfo: { flex: 1 },
    pageItemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    pageItemSize: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    pageShareBtn: { padding: 6 },

    shareBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.shareBtnBg, borderRadius: 60, paddingVertical: 16, marginTop: 12, gap: 10,
    },
    shareBtnText: { color: colors.shareBtnText, fontSize: 16, fontWeight: '700' },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.retryBg, borderWidth: 1, borderColor: colors.border2,
      borderRadius: 60, paddingVertical: 16, marginTop: 12, gap: 10,
    },
    retryBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

    renameBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8', borderRadius: 60,
      paddingHorizontal: 18, paddingVertical: 19, gap: 10, marginTop: 12,
    },
    renameBtnLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
    renameBtnRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    renameBtnValue: { color: ACCENT, fontSize: 15, fontWeight: '600' },

    renameModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    renameModalBox: {
      backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 20, paddingTop: 28, paddingBottom: 50,
    },
    renameModalTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
    renameInput: {
      backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', borderRadius: 16, padding: 16, fontSize: 16,
      color: colors.textPrimary, borderWidth: 1, borderColor: isDark ? '#3a3a3a' : '#e0e0e0', marginBottom: 20,
    },
    renameButtonsContainer: { flexDirection: 'row', gap: 12 },
    renameCancelButton: {
      flex: 1, backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
      paddingVertical: 16, borderRadius: 60, alignItems: 'center',
    },
    renameCancelButtonText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    renameDoneButton: {
      flex: 1, backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 60, alignItems: 'center',
    },
    renameDoneButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    pdfViewerContainer: { flex: 1, backgroundColor: colors.bg },
    pdfViewerHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
      paddingBottom: 16, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border2,
    },
    pdfViewerTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    pdfView: { flex: 1, backgroundColor: colors.bg },
    pdfLoading: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    pdfLoadingText: { marginTop: 10, color: colors.textSecondary, fontSize: 14 },
  });

export default SplitPDF;
