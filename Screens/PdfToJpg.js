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
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getPdfInfo, pdfToImages, isPdfLocked } from '../modules/pdf-tools';
import { Paths } from 'expo-file-system';

const ACCENT = '#00897B';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PdfToJpg = ({ navigation }) => {
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]); // { path, size }[]
  const [quality, setQuality] = useState(85);
  const [isLocked, setIsLocked] = useState(false);

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
        let pages = 0;
        try {
          const info = await getPdfInfo(inputPath);
          pages = info.pageCount;
        } catch {}

        let locked = false;
        try {
          const lockStatus = await isPdfLocked(inputPath);
          locked = lockStatus.locked;
        } catch {}

        setPdf({ uri: asset.uri, name: asset.name, size: asset.size });
        setPageCount(pages);
        setIsLocked(locked);
        setImages([]);
      }
    } catch {
      triggerToast('Error', 'Failed to pick PDF file', 'error', 2500);
    }
  };

  const doConvert = async () => {
    if (!pdf) return;
    setLoading(true);
    try {
      const inputPath = pdf.uri.replace(/^file:\/\//, '');
      const cachePath = Paths.cache.uri.replace(/^file:\/\//, '');
      const outputDir = `${cachePath}/pdf_to_jpg_${Date.now()}`;

      const result = await pdfToImages(inputPath, outputDir, quality);

      const imgs = result.paths.map((p, i) => ({
        path: p,
        uri: `file://${p}`,
        size: result.sizes[i],
      }));

      setImages(imgs);
      triggerToast('Done', `Converted ${result.pageCount} pages to JPG!`, 'success', 2500);
    } catch (error) {
      console.log('PdfToJpg error:', error);
      const msg = error?.message || '';
      if (msg.includes('decrypt') || msg.includes('password')) {
        triggerToast('Locked PDF', 'This PDF is password protected. Unlock it first using Lock/Unlock PDF tool.', 'error', 4000);
      } else {
        triggerToast('Error', msg || 'Conversion failed', 'error', 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  const shareImage = async (uri) => {
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const QUALITY_OPTIONS = [
    { label: 'Low', value: 50, desc: 'Smallest file size' },
    { label: 'Medium', value: 70, desc: 'Balanced quality' },
    { label: 'High', value: 85, desc: 'Good quality' },
    { label: 'Best', value: 100, desc: 'Maximum quality' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={loading}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>PDF to JPG</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!pdf && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-image" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>PDF to JPG</Text>
            <Text style={styles.emptyDesc}>Convert each page of a PDF into a JPG image</Text>
          </View>
        )}

        {/* Selected PDF Info */}
        {pdf && (
          <View style={styles.pdfInfoCard}>
            <FontAwesome5 name="file-pdf" size={32} color={isLocked ? '#D50000' : ACCENT} />
            <View style={styles.pdfInfoText}>
              <Text style={styles.pdfInfoName} numberOfLines={1}>{pdf.name}</Text>
              <Text style={styles.pdfInfoMeta}>
                {pageCount ? `${pageCount} pages` : ''}{pageCount && pdf.size ? ' · ' : ''}{formatSize(pdf.size)}
              </Text>
            </View>
            {isLocked && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={14} color="#D50000" />
                <Text style={styles.lockedBadgeText}>Locked</Text>
              </View>
            )}
          </View>
        )}
        {pdf && isLocked && (
          <View style={styles.lockedMsg}>
            <Ionicons name="warning" size={16} color="#D50000" />
            <Text style={styles.lockedMsgText}>
              This PDF is password protected. Unlock it first using the Lock/Unlock PDF tool.
            </Text>
          </View>
        )}

        {/* Quality Selector */}
        {pdf && !isLocked && images.length === 0 && (
          <View style={styles.qualitySection}>
            <Text style={styles.sectionTitle}>Image Quality</Text>
            <View style={styles.qualityRow}>
              {QUALITY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.qualityChip, quality === opt.value && styles.qualityChipActive]}
                  onPress={() => setQuality(opt.value)}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  <Text style={[styles.qualityChipText, quality === opt.value && styles.qualityChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Pick Button */}
        {images.length === 0 && (
          <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} activeOpacity={0.8} disabled={loading}>
            <FontAwesome5 name="file-pdf" size={20} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>{!pdf ? 'Pick PDF File' : 'Change PDF'}</Text>
          </TouchableOpacity>
        )}

        {/* Convert Button */}
        {pdf && !isLocked && images.length === 0 && (
          <TouchableOpacity
            style={[styles.convertBtn, loading && styles.btnDisabled]}
            onPress={doConvert}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="image" size={22} color="#fff" />
            )}
            <Text style={styles.convertBtnText}>
              {loading ? 'Converting...' : `Convert ${pageCount} Page${pageCount > 1 ? 's' : ''} to JPG`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Result Section */}
        {images.length > 0 && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={ACCENT} />
              <Text style={styles.successText}>
                {images.length} image{images.length > 1 ? 's' : ''} created!
              </Text>
            </View>

            {/* Image Horizontal Scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageScroll}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageCard}>
                  <Image source={{ uri: img.uri }} style={styles.imageThumb} resizeMode="cover" />
                  <View style={styles.imageCardFooter}>
                    <View style={styles.imageCardInfo}>
                      <Text style={styles.imageCardPage}>Page {index + 1}</Text>
                      <Text style={styles.imageCardSize}>{formatSize(img.size)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.imageShareBtn}
                      onPress={() => shareImage(img.uri)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="share" size={16} color={isDark ? '#000000' : '#ffffff'} />
                      <Text style={styles.imageShareText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setImages([]); }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Convert Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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

    lockedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#D5000020', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    },
    lockedBadgeText: { fontSize: 12, fontWeight: '700', color: '#D50000' },
    lockedMsg: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#D5000015', borderRadius: 14, borderWidth: 1, borderColor: '#D5000030',
      padding: 14, marginTop: 12,
    },
    lockedMsgText: { flex: 1, fontSize: 13, color: '#D50000', lineHeight: 18 },

    qualitySection: { marginTop: 18 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
    qualityRow: { flexDirection: 'row', gap: 8 },
    qualityChip: {
      flex: 1, paddingVertical: 12, borderRadius: 54, alignItems: 'center',
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    },
    qualityChipActive: {
      backgroundColor: ACCENT + '20', borderColor: ACCENT,
    },
    qualityChipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    qualityChipTextActive: { color: ACCENT },

    pickBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.pickBg, borderWidth: 2, borderColor: colors.pickBorder,
      borderStyle: 'dashed', borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    pickBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

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

    imageScroll: {
      gap: 12, marginTop: 16, paddingRight: 4,
    },
    imageCard: {
      width: (SCREEN_WIDTH - 52) / 2,
      backgroundColor: colors.card,
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden',
    },
    imageThumb: {
      width: '100%',
      height: (SCREEN_WIDTH - 52) / 2,
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    },
    imageCardFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 10,
    },
    imageCardInfo: { flex: 1 },
    imageCardPage: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    imageCardSize: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    imageShareBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, gap: 4,
      backgroundColor: isDark ? '#ffffff' : '#000000',
    },
    imageShareText: {
      fontSize: 12, fontWeight: '600', color: isDark ? '#000000' : '#ffffff',
    },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.retryBg, borderWidth: 1, borderColor: colors.border2,
      borderRadius: 60, paddingVertical: 16, marginTop: 12, gap: 10,
    },
    retryBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  });

export default PdfToJpg;
