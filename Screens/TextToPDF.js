import { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Share,
  PermissionsAndroid,
  Modal,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { RichEditor, actions } from 'react-native-pell-rich-editor';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from '@react-native-community/blur';
import Pdf from 'react-native-pdf';
import { Paths } from 'expo-file-system';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import { generatePdf } from '../modules/text-to-pdf';
import { saveToDownloads } from '../modules/zip-tools';
import * as Print from 'expo-print';

const ACCENT = '#9C27B0';
const ACCENT_LIGHT = '#7B1FA2';

const DEFAULT_TITLE = 'Tools App Generated PDF';

const PAGE_SIZES = {
  'A4': { width: 595, height: 842, label: 'A4 (210 × 297 mm)' },
  'A3': { width: 842, height: 1191, label: 'A3 (297 × 420 mm)' },
  'A5': { width: 420, height: 595, label: 'A5 (148 × 210 mm)' },
  'Letter': { width: 612, height: 792, label: 'Letter (8.5 × 11 in)' },
  'Legal': { width: 612, height: 1008, label: 'Legal (8.5 × 14 in)' },
  'Executive': { width: 522, height: 756, label: 'Executive (7.25 × 10.5 in)' },
  'B4': { width: 709, height: 1001, label: 'B4 (250 × 353 mm)' },
  'B5': { width: 499, height: 709, label: 'B5 (176 × 250 mm)' },
};

const FONT_SIZES = [
  { key: 'small', label: 'Small', size: 10 },
  { key: 'medium', label: 'Medium', size: 18 },
  { key: 'large', label: 'Large', size: 28 },
];

const TextToPDF = ({ navigation }) => {
  const [pdfTitle, setPdfTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [pageSize, setPageSize] = useState('A4');
  const [fontSize, setFontSize] = useState('medium');
  const [pageSizeModalVisible, setPageSizeModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { path, pages, size }
  const [saving, setSaving] = useState(false);
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [textEditorVisible, setTextEditorVisible] = useState(false);
  const richEditorRef = useRef(null);
  const [richContentHtml, setRichContentHtml] = useState('');
  const [activeFormats, setActiveFormats] = useState(new Set());
  const [editorMode, setEditorMode] = useState('normal'); // 'normal' or 'rich'
  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const selectedFontSize = FONT_SIZES.find(f => f.key === fontSize)?.size ?? 12;

  // Speech recognition listeners
  const pickEditorImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission', 'Gallery access needed', 'alert', 2000);
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    const base64Uri = `data:image/jpeg;base64,${asset.base64}`;
    richEditorRef.current?.insertImage(base64Uri, 'width: 100%; height: 200px; border-radius: 6px; object-fit: cover; margin: 8px 0;');
  };

  const handleGenerate = async () => {
    const text = bodyText.trim();
    if (!text && editorMode === 'normal') return;
    if (editorMode === 'rich' && !richContentHtml?.trim()) return;

    setLoading(true);
    try {
      const title = pdfTitle.trim() || DEFAULT_TITLE;
      const { width, height } = PAGE_SIZES[pageSize];
      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const cleanPath = `${cacheDir}/ToolsApp_TextToPDF_${Date.now()}.pdf`;

      let res;
      if (editorMode === 'rich' && richContentHtml?.trim()) {
        // Use expo-print for crystal clear, real text-based PDF
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: 'Helvetica', 'Arial', sans-serif;
                  font-size: ${selectedFontSize}px;
                  line-height: 1.6;
                  color: #000;
                  padding: 40px;
                  max-width: 100%;
                }
                h1.pdf-title {
                  font-size: ${selectedFontSize * 1.6}px;
                  font-weight: bold;
                  margin-bottom: 8px;
                }
                .title-separator {
                  border: none;
                  border-top: 1px solid #ccc;
                  margin-bottom: 20px;
                }
                img {
                  max-width: 100%;
                  height: auto;
                  border-radius: 6px;
                  margin: 8px 0;
                }
                p { margin: 8px 0; }
                ul, ol { margin: 8px 0; padding-left: 24px; }
                li { margin: 4px 0; }
              </style>
            </head>
            <body>
              <h1 class="pdf-title">${title}</h1>
              <hr class="title-separator" />
              ${richContentHtml}
            </body>
          </html>
        `;

        const { uri } = await Print.printToFileAsync({
          html: htmlContent,
          base64: false,
          width: width,
          height: height,
        });

        res = {
          path: uri.replace('file://', ''),
          pages: 1,
          size: 0,
        };
      } else {
        res = await generatePdf(text, title, cleanPath, width, height, selectedFontSize);
      }
      setResult(res);
      setActiveFormats(new Set());
    } catch (e) {
      console.error('Text to PDF error:', e);
    } finally {
      setLoading(false);
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

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        console.error('Storage permission denied');
        return;
      }
      const fileName = `${(pdfTitle.trim() || DEFAULT_TITLE).replace(/[^a-zA-Z0-9 ]/g, '').trim()}.pdf`;
      await saveToDownloads(result.path, fileName, 'application/pdf');
      triggerToast('Saved', 'PDF saved to Downloads', 'success', 2500);
    } catch (e) {
      console.error('Save error:', e);
      triggerToast('Error', 'Failed to save PDF', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({ url: `file://${result.path}`, title: 'Share PDF' });
    } catch (e) {
      console.error('Share error:', e);
    }
  };

  const handleReset = () => {
    setResult(null);
    setBodyText('');
    setPdfTitle('');
    setPageSize('A4');
    setFontSize('medium');
  };

  const [liveText, setLiveText] = useState('');
  const displayText = textEditorVisible ? liveText : bodyText;
  const charCount = displayText.length;
  const wordCount = displayText.trim() ? displayText.trim().split(/\s+/).length : 0;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Text to PDF</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {!result ? (
          <>
            {/* Title Input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PDF Title</Text>
              <TextInput
                style={styles.titleInput}
                placeholder={DEFAULT_TITLE}
                placeholderTextColor={colors.textMuted}
                value={pdfTitle}
                onChangeText={setPdfTitle}
                maxLength={120}
              />
            </View>

            {/* Body Text — Open Editor Button */}
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>Text Content</Text>
                {bodyText ? <Text style={styles.counterText}>{wordCount} words · {charCount} chars</Text> : null}
              </View>
              <TouchableOpacity
                style={styles.openEditorBtn}
                onPress={() => setTextEditorVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={18} color={accent} />
                <Text style={styles.openEditorBtnText}>
                  {bodyText ? 'Edit Text Content' : 'Open Text Editor'}
                </Text>
                <MaterialCommunityIcons name="arrow-expand" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
              {bodyText ? (
                <Text style={styles.bodyPreviewText} numberOfLines={3}>
                  {bodyText}
                </Text>
              ) : null}
            </View>

            {/* Options Row */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.optionBtn}
                onPress={() => setPageSizeModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.optionBtnIconBg}>
                  <MaterialCommunityIcons name="file-document-outline" size={18} color={accent} />
                </View>
                <Text style={styles.optionBtnLabel}>Page Size</Text>
                <View style={styles.optionBtnRight}>
                  <Text style={[styles.optionBtnValue, { color: accent }]}>{pageSize}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Font Size */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Font Size</Text>
              <View style={styles.fontSizeRow}>
                {FONT_SIZES.map(f => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.fontSizeBtn, fontSize === f.key && { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => setFontSize(f.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fontSizeBtnText, fontSize === f.key && { color: '#fff' }]}>
                      {f.label}
                    </Text>
                    <Text style={[styles.fontSizeBtnSub, fontSize === f.key && { color: '#ffffffaa' }]}>
                      {f.size}pt
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Generate Button */}
            <TouchableOpacity
              style={[styles.generateBtn, (!bodyText.trim() || loading) && { opacity: 0.5 }]}
              onPress={handleGenerate}
              activeOpacity={0.8}
              disabled={!bodyText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="file-pdf-box" size={22} color="#fff" />
              )}
              <Text style={styles.generateBtnText}>
                {loading ? 'Generating...' : 'Generate PDF'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Result State */
          <View style={styles.resultContainer}>
            <View style={styles.resultIcon}>
              <MaterialCommunityIcons name="file-pdf-box" size={64} color={accent} />
            </View>
            <Text style={styles.resultTitle}>PDF Generated!</Text>
            <Text style={styles.resultSub}>
              {result.pages} {result.pages === 1 ? 'page' : 'pages'} · {pageSize} · {(result.size / 1024).toFixed(1)} KB
            </Text>

            {/* Action Buttons */}
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

            {/* Show PDF */}
            <TouchableOpacity style={styles.showPdfBtn} onPress={() => setPdfViewerVisible(true)} activeOpacity={0.8}>
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.showPdfBtnText}>Show PDF</Text>
            </TouchableOpacity>

            {/* Generate New */}
            <TouchableOpacity style={styles.generateAgainBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.generateAgainBtnText}>Generate New PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Full-Screen Text Editor Modal */}
      <Modal
        visible={textEditorVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={async () => {
          if (editorMode === 'rich') {
            try {
              const html = await richEditorRef.current?.getContentHtml();
              if (html) {
                setRichContentHtml(html);
                const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                setBodyText(plain);
              }
            } catch (_) {}
          }
          setTextEditorVisible(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Header */}
          <View style={[styles.editorHeader, { borderBottomColor: '#e0e0e0' }]}>
            <Text style={[styles.editorTitle, { color: '#1a1a1a' }]}>Edit Text</Text>
            <View style={styles.editorHeaderRight}>
              <TouchableOpacity onPress={() => {
                if (editorMode === 'rich') {
                  richEditorRef.current?.setContentHTML('');
                  setRichContentHtml('');
                }
                setBodyText('');
                setLiveText('');
                setActiveFormats(new Set());
              }} activeOpacity={0.7} style={styles.editorClearBtn}>
                <Text style={styles.editorClearBtnText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                if (editorMode === 'rich') {
                  try {
                    const html = await richEditorRef.current?.getContentHtml();
                    if (html) {
                      setRichContentHtml(html);
                      const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                      setBodyText(plain);
                    }
                  } catch (_) {}
                }
                setTextEditorVisible(false);
              }} activeOpacity={0.7} style={styles.editorDoneBtn}>
                <Text style={styles.editorDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Counter + Toggle + Undo/Redo */}
          <View style={styles.editorCounterRow}>
            <Text style={[styles.editorCounterText, { color: '#999' }]}>{wordCount} words · {charCount} chars</Text>

            {/* Normal / Rich Toggle */}
            <View style={styles.modeToggleContainer}>
              <Pressable
                style={[styles.modeToggleBtn, editorMode === 'normal' && styles.modeToggleBtnActive]}
                onPress={() => setEditorMode('normal')}
              >
                <Text style={[styles.modeToggleText, editorMode === 'normal' && styles.modeToggleTextActive]}>Normal</Text>
              </Pressable>
              <Pressable
                style={[styles.modeToggleBtn, editorMode === 'rich' && styles.modeToggleBtnActive]}
                onPress={() => setEditorMode('rich')}
              >
                <Text style={[styles.modeToggleText, editorMode === 'rich' && styles.modeToggleTextActive]}>Rich</Text>
              </Pressable>
            </View>

            <View style={styles.editorUndoRedoRow}>
              <TouchableOpacity
                onPress={() => editorMode === 'rich' && richEditorRef.current?.sendAction(actions.undo, 'result')}
                activeOpacity={0.7}
                disabled={editorMode === 'normal'}
                style={[styles.editorUndoRedoBtn, { backgroundColor: '#e8e8e8' }, editorMode === 'normal' && { opacity: 0.3 }]}
              >
                <Octicons name="undo" size={16} color="#1a1a1a" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => editorMode === 'rich' && richEditorRef.current?.sendAction(actions.redo, 'result')}
                activeOpacity={0.7}
                disabled={editorMode === 'normal'}
                style={[styles.editorUndoRedoBtn, { backgroundColor: '#e8e8e8' }, editorMode === 'normal' && { opacity: 0.3 }]}
              >
                <Octicons name="redo" size={16} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Rich Toolbar — only in rich mode */}
          {editorMode === 'rich' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.richToolbarRow} style={styles.richToolbarFixed}>
              {[
                { key: 'bold', action: actions.setBold, icon: 'format-bold' },
                { key: 'italic', action: actions.setItalic, icon: 'format-italic' },
                { key: 'underline', action: actions.setUnderline, icon: 'format-underlined' },
                { key: 'strikeThrough', action: actions.setStrikethrough, icon: 'format-strikethrough' },
              ].map(tool => (
                <TouchableOpacity
                  key={tool.key}
                  style={[styles.richToolBtn, activeFormats.has(tool.key) && styles.richToolBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    richEditorRef.current?.sendAction(tool.action, 'result');
                    // Immediately toggle visual state — registerToolbar will correct it
                    setActiveFormats(prev => {
                      const n = new Set(prev);
                      n.has(tool.key) ? n.delete(tool.key) : n.add(tool.key);
                      return n;
                    });
                  }}
                >
                  <MaterialIcons name={tool.icon} size={22} color={activeFormats.has(tool.key) ? '#fff' : '#1a1a1a'} />
                </TouchableOpacity>
              ))}
              <View style={styles.toolbarDivider} />
              {[
                { action: actions.insertBulletsList, icon: 'format-list-bulleted', key: 'unorderedList' },
                { action: actions.insertOrderedList, icon: 'format-list-numbered', key: 'orderedList' },
              ].map(tool => (
                <TouchableOpacity
                  key={tool.key}
                  style={[styles.richToolBtn, activeFormats.has(tool.key) && styles.richToolBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => richEditorRef.current?.sendAction(tool.action, 'result')}
                >
                  <MaterialIcons name={tool.icon} size={22} color={activeFormats.has(tool.key) ? '#fff' : '#1a1a1a'} />
                </TouchableOpacity>
              ))}
              <View style={styles.toolbarDivider} />
              {[
                { action: actions.alignLeft, icon: 'format-align-left', key: 'justifyLeft' },
                { action: actions.alignCenter, icon: 'format-align-center', key: 'justifyCenter' },
                { action: actions.alignRight, icon: 'format-align-right', key: 'justifyRight' },
              ].map(tool => (
                <TouchableOpacity
                  key={tool.key}
                  style={[styles.richToolBtn, activeFormats.has(tool.key) && styles.richToolBtnActive]}
                  activeOpacity={0.7}
                  onPress={() => richEditorRef.current?.sendAction(tool.action, 'result')}
                >
                  <MaterialIcons name={tool.icon} size={22} color={activeFormats.has(tool.key) ? '#fff' : '#1a1a1a'} />
                </TouchableOpacity>
              ))}
              <View style={styles.toolbarDivider} />
              {[
                { size: 2, iconSize: 14 },
                { size: 4, iconSize: 18 },
                { size: 6, iconSize: 22 },
              ].map(tool => (
                <TouchableOpacity
                  key={tool.size}
                  style={styles.richToolBtn}
                  activeOpacity={0.7}
                  onPress={() => richEditorRef.current?.sendAction(actions.fontSize, 'result', tool.size)}
                >
                  <MaterialIcons name="format-size" size={tool.iconSize} color="#1a1a1a" />
                </TouchableOpacity>
              ))}
              <View style={styles.toolbarDivider} />
              <TouchableOpacity style={styles.richToolBtn} activeOpacity={0.7} onPress={pickEditorImage}>
                <MaterialIcons name="image" size={22} color="#1a1a1a" />
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Editor Area */}
          <View style={{ flex: 1 }}>
            {editorMode === 'rich' ? (
              <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingTop: 20 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <View style={{ backgroundColor: '#fff' }}>
                  <RichEditor
                    ref={richEditorRef}
                    initialContentHTML={richContentHtml || (bodyText ? `<p>${bodyText.replace(/\n/g, '</p><p>')}</p>` : '')}
                    placeholder="Type or paste your text here..."
                    initialFocus={true}
                    editorStyle={{
                      backgroundColor: '#fff',
                      color: '#1a1a1a',
                      placeholderColor: '#aaa',
                      contentCSSText: 'font-size: 15px; line-height: 24px; padding: 12px 16px 500px 16px; min-height: 100vh;',
                    }}
                    onChange={(html) => {
                      setRichContentHtml(html);
                      const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                      setLiveText(plain);
                    }}
                    editorInitializedCallback={() => {
                      richEditorRef.current?.registerToolbar((items) => {
                        setActiveFormats(new Set(items));
                      });
                    }}
                    style={{ flex: 1, minHeight: 600 }}
                  />
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
                <TextInput
                  style={styles.normalEditorInput}
                  placeholder="Type or paste your text here..."
                  placeholderTextColor="#aaa"
                  value={bodyText}
                  onChangeText={(t) => { setBodyText(t); setLiveText(t); }}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                  scrollEnabled={false}
                />
              </ScrollView>
            )}
          </View>
        </View>
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
          {pdfViewerVisible && result ? (
            <Pdf
              source={{ uri: `file://${result.path}` }}
              style={styles.pdfView}
              trustAllCerts={false}
              onError={(error) => console.log('PDF Error:', error)}
              renderActivityIndicator={() => (
                <View style={styles.pdfLoading}>
                  <ActivityIndicator size="large" color={accent} />
                  <Text style={styles.pdfLoadingText}>Loading PDF...</Text>
                </View>
              )}
            />
          ) : null}
        </View>
      </Modal>

      {/* Page Size Modal */}
      <Pressable
        style={[styles.modalOverlay, !pageSizeModalVisible && { display: 'none' }]}
        onPress={() => setPageSizeModalVisible(false)}
      >
        <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
        <Pressable style={styles.modalContent} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Page Size</Text>
            <TouchableOpacity onPress={() => setPageSizeModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            {Object.keys(PAGE_SIZES).map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.modalOption, pageSize === size && styles.modalOptionActive]}
                onPress={() => { setPageSize(size); setPageSizeModalVisible(false); }}
                activeOpacity={0.7}
              >
                <View style={styles.modalOptionLeft}>
                  <MaterialIcons name="description" size={22} color={pageSize === size ? accent : colors.textSecondary} />
                  <View style={styles.modalOptionText}>
                    <Text style={[styles.modalOptionName, pageSize === size && { color: accent }]}>{size}</Text>
                    <Text style={styles.modalOptionSub}>{PAGE_SIZES[size].label}</Text>
                  </View>
                </View>
                {pageSize === size && (
                  <Ionicons name="checkmark-circle" size={22} color={accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
};

const createStyles = (colors, accent, isDark) =>
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

    section: { marginTop: 20 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
    counterText: { fontSize: 12, color: colors.textMuted },

    titleInput: {
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderRadius: 56,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },

    openEditorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    openEditorBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: accent,
    },
    bodyPreviewText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 10,
      lineHeight: 19,
      paddingHorizontal: 4,
    },
    expandIconBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 14,
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voiceBtn: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 12,
      gap: 8,
    },
    voiceBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    voiceActiveRow: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      right: 10,
      flexDirection: 'row',
      gap: 10,
    },
    voiceListeningBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2a1a1a' : '#fff0f0',
      borderRadius: 60,
      paddingVertical: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: '#ff4444',
    },
    voiceListeningText: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
    voiceStopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ff4444',
      borderRadius: 60,
      paddingVertical: 14,
      paddingHorizontal: 24,
      gap: 6,
    },
    voiceStopText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    editorVoiceRow: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    editorVoiceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 12,
      gap: 8,
    },
    editorVoiceActiveRow: {
      flexDirection: 'row',
      gap: 10,
    },
    editorVoiceListeningBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2a1a1a' : '#fff0f0',
      borderRadius: 60,
      paddingVertical: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: '#ff4444',
    },
    editorVoiceStopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ff4444',
      borderRadius: 60,
      paddingVertical: 12,
      paddingHorizontal: 24,
      gap: 6,
    },

    optionsRow: { marginTop: 20 },
    optionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderRadius: 60,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
      gap: 10,
    },
    optionBtnIconBg: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: accent + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionBtnLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    optionBtnRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    optionBtnValue: { fontSize: 14, fontWeight: '700' },

    fontSizeRow: { flexDirection: 'row', gap: 12 },
    fontSizeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 60,
      backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5',
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#e0e0e0',
    },
    fontSizeBtnText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    fontSizeBtnSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

    // Full-screen text editor
    editorContainer: { flex: 1, backgroundColor: colors.bg },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : '#e0e0e0',
    },
    editorTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
    editorHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    editorDoneBtn: {
      backgroundColor: accent,
      borderRadius: 60,
      paddingHorizontal: 18,
      paddingVertical: 8,
    },
    editorCounterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    modeToggleContainer: {
      flexDirection: 'row',
      backgroundColor: '#e8e8e8',
      borderRadius: 20,
      padding: 2,
    },
    modeToggleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 18,
    },
    modeToggleBtnActive: {
      backgroundColor: accent,
    },
    modeToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#666',
    },
    modeToggleTextActive: {
      color: '#fff',
    },
    normalEditorInput: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      fontSize: 15,
      color: '#1a1a1a',
      lineHeight: 24,
      textAlignVertical: 'top',
      paddingBottom: 300,
    },
    editorUndoRedoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    editorUndoRedoBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    editorCounterText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    editorClearBtn: {
      backgroundColor: '#fff0f0',
      borderRadius: 60,
      paddingHorizontal: 18,
      paddingVertical: 8,
    },
    editorClearBtnText: { color: '#d32f2f', fontWeight: '700', fontSize: 14 },
    editorDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    editorInput: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 24,
      textAlignVertical: 'top',
      paddingBottom:100,
    },

    // Rich/Plain toggle
    editorModeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
      borderRadius: 60,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    editorModeBtnText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },

    // Rich toolbar
    richToolbarFixed: {
      backgroundColor: '#f5f5f5',
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
      paddingVertical: 8,
      flexGrow: 0,
    },
    toolbarDivider: {
      width: 1,
      height: 24,
      backgroundColor: '#ccc',
      marginHorizontal: 4,
      alignSelf: 'center',
    },
    richToolbarRow: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
    },
    richToolBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 56,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: '#e8e8e8',
    },
    richToolBtnActive: {
      backgroundColor: accent,
    },
    richToolLabel: { fontSize: 10, fontWeight: '600', color: '#888', marginTop: 2 },

    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 18,
      marginTop: 28,
      gap: 10,
    },
    generateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    // Result state
    resultContainer: { alignItems: 'center', paddingTop: 40 },
    resultIcon: {
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: accent + '20',
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
    showPdfBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 12,
      gap: 10,
      width: '100%',
    },
    showPdfBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    generateAgainBtn: {
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
    generateAgainBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },

    // PDF Viewer
    pdfViewerContainer: { flex: 1, backgroundColor: colors.bg },
    pdfViewerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
      paddingBottom: 16,
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border2,
    },
    pdfViewerTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    pdfView: { flex: 1, backgroundColor: colors.bg },
    pdfLoading: { alignItems: 'center', justifyContent: 'center', gap: 12 },
    pdfLoadingText: { fontSize: 14, color: colors.textSecondary },

    // Modal
    modalOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card || (isDark ? '#1c1c1e' : '#ffffff'),
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 40,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    modalScroll: { maxHeight: 400 },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 56,
      marginBottom: 4,
    },
    modalOptionActive: { backgroundColor: accent + '15' },
    modalOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    modalOptionText: {},
    modalOptionName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    modalOptionSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  });

export default TextToPDF;
