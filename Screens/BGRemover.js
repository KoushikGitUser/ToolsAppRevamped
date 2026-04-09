import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { triggerToast } from '../Services/toast';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Paths } from 'expo-file-system';
import { useTheme } from '../Services/ThemeContext';
import { removeBackground } from '../modules/bg-remover';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#00BFA5';

const BGRemover = ({ navigation }) => {
  const [image, setImage] = useState(null);
  const [resultUri, setResultUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moduleReady, setModuleReady] = useState(false);

  const { colors, isDark } = useTheme();
  const accent = ACCENT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  // Check if module was previously downloaded
  useEffect(() => {
    AsyncStorage.getItem('bgRemoverModuleReady').then(val => {
      if (val === 'true') setModuleReady(true);
    }).catch(() => {});
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission', 'Gallery access needed', 'alert', 2000);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled) return;
    setImage(result.assets[0]);
    setResultUri(null);
  };

  const handleRemove = async () => {
    if (!image) return;

    // If module not ready, check internet first
    if (!moduleReady) {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {       
        triggerToast('No Internet', 'Internet is required to download the AI module for first use. Please connect and try again.', 'error', 4000);
        return;
      }
    }

    setLoading(true);
    try {
      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const outputPath = `${cacheDir}/ToolsApp_BGRemoved_${Date.now()}.png`;
      const res = await removeBackground(image.uri, outputPath);
      setResultUri(res.path);

      // Mark module as ready for future use
      if (!moduleReady) {
        setModuleReady(true);
        AsyncStorage.setItem('bgRemoverModuleReady', 'true').catch(() => {});
      }

      triggerToast('Success', 'Background removed', 'success', 2000);
    } catch (e) {
      console.log('BG Remove error:', e);
      const errMsg = e?.message || '';
      if (errMsg.toLowerCase().includes('waiting') || errMsg.toLowerCase().includes('download')) {
        triggerToast('Downloading', 'AI module is downloading for first use. Please wait and try again.', 'alert', 4000);
      } else {
        triggerToast('Error', errMsg || 'Failed to remove background', 'error', 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!resultUri) return;
    setSaving(true);
    try {
      if (Platform.OS === 'android' && Platform.Version < 29) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      }
      const fileName = `ToolsApp_BGRemoved_${Date.now()}.png`;
      await saveToDownloads(resultUri, fileName, 'image/png');
      triggerToast('Saved', 'Image saved to Downloads', 'success', 2000);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!resultUri) return;
    await Sharing.shareAsync('file://' + resultUri, { mimeType: 'image/png' });
  };

  const handleReset = () => {
    setImage(null);
    setResultUri(null);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Image BG Remover</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!image && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="image-filter-hdr" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Remove Background</Text>
            <Text style={styles.emptyDesc}>
              Pick an image to remove its background using on-device AI
            </Text>
          </View>
        )}

        {/* Image Preview */}
        {image && (
          <View style={styles.previewCard}>
            <View style={styles.checkeredBg}>
              <Image
                source={{ uri: resultUri ? `file://${resultUri}` : image.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </View>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Removing background...</Text>
              </View>
            )}
          </View>
        )}

        {/* Pick Button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickImage} activeOpacity={0.8} disabled={loading}>
          <Ionicons name="image" size={22} color={colors.textPrimary} />
          <Text style={styles.pickBtnText}>
            {!image ? 'Pick Image' : 'Change Image'}
          </Text>
        </TouchableOpacity>

        {/* Remove Button */}
        {image && !resultUri && (
          <TouchableOpacity
            style={[styles.actionBtn, loading && { opacity: 0.5 }]}
            onPress={handleRemove}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="image-filter-hdr" size={22} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>
              {loading ? 'Processing...' : 'Remove Background'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Result Actions */}
        {resultUri && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={24} color={accent} />
              <Text style={styles.successText}>Background Removed!</Text>
            </View>

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
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Remove Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

    // Empty State
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
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

    // Preview
    previewCard: {
      marginTop: 16,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    checkeredBg: {
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
      // Checkered pattern effect via nested views not practical, use solid bg
    },
    previewImage: {
      width: '100%',
      height: 300,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
    },
    loadingText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      marginTop: 10,
    },

    // Pick Button
    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.pickBg,
      borderWidth: 2,
      borderColor: colors.pickBorder,
      borderStyle: 'dashed',
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 16,
      gap: 10,
    },
    pickBtnText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },

    // Action Button
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 16,
      gap: 10,
    },
    actionBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },

    // Result
    resultSection: { marginTop: 16 },
    successBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent + '20',
      borderRadius: 60,
      borderWidth: 1,
      borderColor: accent + '40',
      paddingVertical: 14,
      gap: 10,
    },
    successText: {
      color: accent,
      fontSize: 16,
      fontWeight: '700',
    },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    saveBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.saveBtnBg,
      borderRadius: 60,
      paddingVertical: 16,
      gap: 10,
    },
    saveBtnText: {
      color: colors.saveBtnText,
      fontSize: 16,
      fontWeight: '700',
    },
    shareBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shareBtnBg,
      borderRadius: 60,
      paddingVertical: 16,
      gap: 10,
    },
    shareBtnText: {
      color: colors.shareBtnText,
      fontSize: 16,
      fontWeight: '700',
    },
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
    },
    retryBtnText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default BGRemover;
