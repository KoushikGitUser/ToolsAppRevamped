import { useState, useMemo, useRef } from 'react';
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
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import { triggerToast } from '../Services/toast';
import ImageColors from 'react-native-image-colors';
import tinycolor from 'tinycolor2';
import * as Clipboard from 'expo-clipboard';
import LinearGradient from 'react-native-linear-gradient';

const ACCENT = '#6B8E23';
const ACCENT_LIGHT = '#7FA730';

const ColorTools = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [dominantColors, setDominantColors] = useState([]);
  const [showConverterModal, setShowConverterModal] = useState(false);
  const [showGradientModal, setShowGradientModal] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [rgbInput, setRgbInput] = useState('');

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission Denied', 'Gallery permission is required to select images', 'alert', 3000);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const imageUri = result.assets[0].uri;
      setSelectedImage(imageUri);
      extractDominantColors(imageUri);
    }
  };

  const extractDominantColors = async (imageUri) => {
    setLoading(true);
    try {
      const result = await ImageColors.getColors(imageUri, {
        fallback: '#228B22',
        cache: true,
        key: imageUri,
      });

      let extractedColors = [];

      if (result.platform === 'android') {
        extractedColors = [
          { hex: result.dominant, name: 'Dominant', type: 'dominant' },
          { hex: result.average, name: 'Average', type: 'average' },
          { hex: result.vibrant, name: 'Vibrant', type: 'vibrant' },
          { hex: result.darkVibrant, name: 'Dark Vibrant', type: 'darkVibrant' },
          { hex: result.lightVibrant, name: 'Light Vibrant', type: 'lightVibrant' },
          { hex: result.darkMuted, name: 'Dark Muted', type: 'darkMuted' },
          { hex: result.lightMuted, name: 'Light Muted', type: 'lightMuted' },
          { hex: result.muted, name: 'Muted', type: 'muted' },
        ].filter(c => c.hex);
      } else if (result.platform === 'ios') {
        extractedColors = [
          { hex: result.background, name: 'Background', type: 'background' },
          { hex: result.primary, name: 'Primary', type: 'primary' },
          { hex: result.secondary, name: 'Secondary', type: 'secondary' },
          { hex: result.detail, name: 'Detail', type: 'detail' },
        ].filter(c => c.hex);
      }

      setDominantColors(extractedColors);
      setLoading(false);
      triggerToast('Success', 'Colors extracted successfully!', 'success', 2000);
    } catch (error) {
      console.error('Color extraction error:', error);
      setLoading(false);
      triggerToast('Error', 'Failed to extract colors', 'alert', 3000);
    }
  };

  const copyColorCode = async (colorCode) => {
    await Clipboard.setStringAsync(colorCode);
    triggerToast('Copied', `${colorCode} copied to clipboard`, 'success', 1500);
  };

  const convertHexToRgb = () => {
    try {
      const color = tinycolor(hexInput);
      if (color.isValid()) {
        const rgb = color.toRgb();
        setRgbInput(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        triggerToast('Converted', 'HEX to RGB conversion successful', 'success', 1500);
      } else {
        triggerToast('Invalid', 'Invalid HEX code', 'alert', 2000);
      }
    } catch (error) {
      triggerToast('Error', 'Conversion failed', 'alert', 2000);
    }
  };

  const convertRgbToHex = () => {
    try {
      const color = tinycolor(rgbInput);
      if (color.isValid()) {
        setHexInput(color.toHexString().toUpperCase());
        triggerToast('Converted', 'RGB to HEX conversion successful', 'success', 1500);
      } else {
        triggerToast('Invalid', 'Invalid RGB value', 'alert', 2000);
      }
    } catch (error) {
      triggerToast('Error', 'Conversion failed', 'alert', 2000);
    }
  };

  const clearAll = () => {
    setSelectedImage(null);
    setDominantColors([]);
  };

  const gradientColors = dominantColors.length > 0 ? dominantColors.slice(0, 5).map(c => c.hex) :
                         [accent, '#228B22'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.heading}>Color Tools</Text>
        </View>
        {(dominantColors.length > 0 || selectedImage) && (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        {!selectedImage && dominantColors.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="color-lens" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No colors extracted yet</Text>
            <Text style={styles.emptyDesc}>
              Select an image to extract its dominant color palette
            </Text>
          </View>
        )}

        {/* Selected Image Preview */}
        {selectedImage && (
          <View style={styles.imagePreviewSection}>
            <Text style={styles.sectionTitle}>Selected Image</Text>
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
            </View>
          </View>
        )}

        {/* Dominant Colors Section */}
        {dominantColors.length > 0 && (
          <View style={styles.colorsSection}>
            <Text style={styles.sectionTitle}>Dominant Colors</Text>
            <View style={styles.colorsGrid}>
              {dominantColors.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.colorCard}
                  onPress={() => copyColorCode(color.hex)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: color.hex }]} />
                  <View style={styles.colorInfo}>
                    <Text style={styles.colorName}>{color.name}</Text>
                    <Text style={styles.colorCode}>{color.hex}</Text>
                    <Text style={styles.colorCode}>{tinycolor(color.hex).toRgbString()}</Text>
                  </View>
                  <Ionicons name="copy" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}


        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.loadingText}>Extracting colors...</Text>
          </View>
        )}

        {/* Tool Buttons */}
        <View style={styles.toolButtons}>
          <TouchableOpacity
            style={[styles.toolBtn, loading && styles.btnDisabled]}
            onPress={pickImage}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="images" size={22} color="#fff" />
            <Text style={styles.toolBtnText}>Choose Image</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtnSecondary]}
            onPress={() => setShowConverterModal(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="swap-horiz" size={22} color={colors.textPrimary} />
            <Text style={styles.toolBtnSecondaryText}>Color Converter</Text>
          </TouchableOpacity>

          {dominantColors.length >= 2 && (
            <TouchableOpacity
              style={[styles.toolBtnSecondary]}
              onPress={() => setShowGradientModal(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="gradient" size={22} color={colors.textPrimary} />
              <Text style={styles.toolBtnSecondaryText}>View Gradient</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Color Converter Modal */}
      <Modal
        visible={showConverterModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowConverterModal(false)}
      >
        <View style={styles.converterOverlay}>
          <View style={styles.converterModal}>
            <View style={styles.converterHeader}>
              <Text style={styles.converterTitle}>Color Converter</Text>
              <TouchableOpacity onPress={() => setShowConverterModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.converterContent}>
              <Text style={styles.converterLabel}>HEX Code</Text>
              <View style={styles.converterRow}>
                <TextInput
                  style={styles.converterInput}
                  placeholder="#6B8E23"
                  placeholderTextColor={colors.textMuted}
                  value={hexInput}
                  onChangeText={setHexInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.convertBtn}
                  onPress={convertHexToRgb}
                >
                  <MaterialIcons name="arrow-downward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <MaterialIcons name="swap-vert" size={32} color={colors.textMuted} style={{ alignSelf: 'center', marginVertical: 12 }} />

              <Text style={styles.converterLabel}>RGB Code</Text>
              <View style={styles.converterRow}>
                <TextInput
                  style={styles.converterInput}
                  placeholder="rgb(107, 142, 35)"
                  placeholderTextColor={colors.textMuted}
                  value={rgbInput}
                  onChangeText={setRgbInput}
                />
                <TouchableOpacity
                  style={styles.convertBtn}
                  onPress={convertRgbToHex}
                >
                  <MaterialIcons name="arrow-upward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {(hexInput || rgbInput) && (
                <View style={styles.converterPreview}>
                  <Text style={styles.converterPreviewLabel}>Preview:</Text>
                  <View style={[styles.converterPreviewSwatch, { backgroundColor: hexInput || rgbInput || '#ccc' }]} />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Gradient Modal */}
      <Modal
        visible={showGradientModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowGradientModal(false)}
      >
        <View style={styles.converterOverlay}>
          <View style={styles.converterModal}>
            <View style={styles.converterHeader}>
              <Text style={styles.converterTitle}>Gradient Preview</Text>
              <TouchableOpacity onPress={() => setShowGradientModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.gradientContent}>
              <Text style={styles.gradientLabel}>Horizontal Gradient</Text>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientPreview}
              />

              <Text style={styles.gradientLabel}>Vertical Gradient</Text>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.gradientPreview}
              />

              <Text style={styles.gradientLabel}>Diagonal Gradient</Text>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientPreview}
              />

              <View style={styles.gradientColors}>
                <Text style={styles.gradientColorsLabel}>Colors used:</Text>
                <View style={styles.gradientColorsList}>
                  {gradientColors.map((color, index) => (
                    <View key={index} style={styles.gradientColorItem}>
                      <View style={[styles.gradientColorSwatch, { backgroundColor: color }]} />
                      <Text style={styles.gradientColorText}>{color}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors, accent, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearBtnText: {
    color: accent,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

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

  // Image Preview
  imagePreviewSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  imagePreviewContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  imagePreview: {
    width: '100%',
    height: 250,
    resizeMode: 'contain',
  },

  // Colors Section
  colorsSection: {
    marginBottom: 20,
  },
  colorsGrid: {
    gap: 12,
  },
  colorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  colorSwatch: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  colorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  colorName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  colorCode: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Tool Buttons
  toolButtons: {
    gap: 12,
    marginTop: 20,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    gap: 10,
  },
  toolBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  toolBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderRadius: 60,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  toolBtnSecondaryText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Converter Modal
  converterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  converterModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  converterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2a2a2a' : '#e0e0e0',
  },
  converterTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  converterContent: {
    padding: 20,
  },
  converterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  converterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  converterInput: {
    flex: 1,
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  convertBtn: {
    backgroundColor: accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  converterPreview: {
    marginTop: 20,
    alignItems: 'center',
    gap: 12,
  },
  converterPreviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  converterPreviewSwatch: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },

  // Gradient Modal
  gradientContent: {
    padding: 20,
  },
  gradientLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  gradientPreview: {
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  gradientColors: {
    marginTop: 20,
  },
  gradientColorsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  gradientColorsList: {
    gap: 8,
  },
  gradientColorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gradientColorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
  },
  gradientColorText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: colors.textSecondary,
  },
});

export default ColorTools;
