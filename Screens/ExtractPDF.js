import { useState, useMemo } from 'react';
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
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { getPdfInfo, extractPages, isPdfLocked } from '../modules/pdf-tools';
import { BlurView } from '@react-native-community/blur';
import Pdf from 'react-native-pdf';

const ACCENT = '#AB47BC';

const ExtractPDF = ({ navigation }) => {
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [outputUri, setOutputUri] = useState(null);
  const [outputSize, setOutputSize] = useState(null);
  const [outputPageCount, setOutputPageCount] = useState(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [pdfName, setPdfName] = useState('');
  const [tempPdfName, setTempPdfName] = useState('');
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

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

        let pages = 0;
        try {
          const info = await getPdfInfo(inputPath);
          pages = info.pageCount;
        } catch {}

        setPdf({ uri: asset.uri, name: asset.name, size: asset.size });
        setPageCount(pages);
        setSelectedPages(new Set());
        setOutputUri(null);
        setOutputSize(null);
        setOutputPageCount(null);
      }
    } catch {
      triggerToast('Error', 'Failed to pick PDF file', 'error', 2500);
    }
  };

  const togglePage = (page) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
    setOutputUri(null);
  };

  const selectAll = () => {
    if (selectedPages.size === pageCount) {
      setSelectedPages(new Set());
    } else {
      const all = new Set();
      for (let i = 1; i <= pageCount; i++) all.add(i);
      setSelectedPages(all);
    }
    setOutputUri(null);
  };

  const doExtract = async () => {
    if (!pdf || selectedPages.size === 0) {
      triggerToast('Warning', 'Select at least 1 page to extract', 'alert', 2500);
      return;
    }
    setLoading(true);
    try {
      const inputPath = pdf.uri.replace(/^file:\/\//, '');
      const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1);
      const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
      const fileName = pdfName.trim() ? `${pdfName.trim()}.pdf` : 'Extracted_ToolsApp.pdf';
      const outputPath = `${inputDir}${fileName}`;

      const result = await extractPages(inputPath, sortedPages, outputPath);

      setOutputUri(`file://${result.path}`);
      setOutputSize(result.size || null);
      setOutputPageCount(result.pageCount || null);
      triggerToast('Done', `Extracted ${result.pageCount} pages!`, 'success', 2500);
    } catch (error) {
      console.log('ExtractPDF error:', error);
      triggerToast('Error', error?.message || 'Extract failed', 'error', 3000);
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
      const fileName = pdfName.trim() ? `${pdfName.trim()}.pdf` : `ToolsApp_Extracted_${Date.now()}.pdf`;
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
        <Text style={styles.heading}>Extract PDF</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!pdf && (
          <View style={styles.emptyState}>
            <FontAwesome5 name="file-pdf" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Extract Pages</Text>
            <Text style={styles.emptyDesc}>Select a PDF file and choose specific pages to extract</Text>
          </View>
        )}

        {/* Selected PDF Info */}
        {pdf && (
          <View style={styles.pdfInfoCard}>
            <FontAwesome5 name="file-pdf" size={32} color={ACCENT} />
            <View style={styles.pdfInfoText}>
              <Text style={styles.pdfInfoName} numberOfLines={1}>{pdf.name}</Text>
              <Text style={styles.pdfInfoMeta}>
                {pageCount ? `${pageCount} pages` : ''}{pageCount && pdf.size ? ' · ' : ''}{formatSize(pdf.size)}
              </Text>
            </View>
          </View>
        )}

        {/* Page Selector */}
        {pdf && pageCount > 0 && !outputUri && (
          <View style={styles.pageSelectorSection}>
            <View style={styles.pageSelectorHeader}>
              <Text style={styles.pageSelectorTitle}>
                Select Pages ({selectedPages.size} of {pageCount})
              </Text>
              <TouchableOpacity onPress={selectAll} activeOpacity={0.7}>
                <Text style={styles.selectAllText}>
                  {selectedPages.size === pageCount ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pageGrid}>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
                const isSelected = selectedPages.has(page);
                return (
                  <TouchableOpacity
                    key={page}
                    style={[
                      styles.pageChip,
                      isSelected && styles.pageChipSelected,
                    ]}
                    onPress={() => togglePage(page)}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.pageChipText, isSelected && styles.pageChipTextSelected]}>
                      {page}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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

        {/* Rename Button */}
        {pdf && !outputUri && (
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
        )}

        {/* Extract Button */}
        {pdf && selectedPages.size > 0 && !outputUri && (
          <TouchableOpacity
            style={[styles.extractBtn, loading && styles.btnDisabled]}
            onPress={doExtract}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="document-attach" size={22} color="#fff" />
            )}
            <Text style={styles.extractBtnText}>
              {loading ? 'Extracting...' : `Extract ${selectedPages.size} Page${selectedPages.size > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Result Section */}
        {outputUri && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={ACCENT} />
              <Text style={styles.successText}>
                Extracted! {outputPageCount ? `${outputPageCount} pages` : ''}
              </Text>
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

            <TouchableOpacity style={styles.showPdfBtn} onPress={() => setPdfViewerVisible(true)} activeOpacity={0.8}>
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.showPdfBtnText}>Show Extracted PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setOutputUri(null); setOutputSize(null); setOutputPageCount(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Extract Again</Text>
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
          {pdfViewerVisible && outputUri ? (
            <Pdf
              source={{ uri: outputUri }}
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

    pageSelectorSection: { marginTop: 18 },
    pageSelectorHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    pageSelectorTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    selectAllText: { fontSize: 14, fontWeight: '600', color: ACCENT },

    pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pageChip: {
      width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    },
    pageChipSelected: {
      backgroundColor: ACCENT + '20', borderColor: ACCENT,
    },
    pageChipText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    pageChipTextSelected: { color: ACCENT },

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

    extractBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    extractBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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

    renameBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8', borderRadius: 60,
      paddingHorizontal: 18, paddingVertical: 19, gap: 10, marginTop: 12,
    },
    renameBtnLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
    renameBtnRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    renameBtnValue: { color: ACCENT, fontSize: 15, fontWeight: '600' },

    showPdfBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 12, gap: 10,
    },
    showPdfBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

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

export default ExtractPDF;
