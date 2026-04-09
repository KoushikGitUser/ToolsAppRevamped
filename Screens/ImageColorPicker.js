import { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { triggerToast } from '../Services/toast';
import { getPixelColor } from '../modules/color-picker';
import tinycolor from 'tinycolor2';

const ACCENT = '#E65100';
const ACCENT_LIGHT = '#F57C00';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_CONTAINER_WIDTH = SCREEN_WIDTH - 40; // 20px padding each side

const ImageColorPicker = ({ navigation }) => {
  const [imageUri, setImageUri] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [pickedColor, setPickedColor] = useState(null);
  const [colorHistory, setColorHistory] = useState([]);
  const [magnifierPos, setMagnifierPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef(null);
  const imageLayoutRef = useRef({ x: 0, y: 0 });
  const imageViewRef = useRef(null);
  const pickingRef = useRef(false);

  const [showGoDown, setShowGoDown] = useState(false);
  const goDownOpacity = useRef(new Animated.Value(0)).current;

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission Denied', 'Gallery permission is required', 'error', 3000);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageSize({ width: asset.width, height: asset.height });
      setPickedColor(null);
      setColorHistory([]);
      setMagnifierPos(null);

      // Calculate display size maintaining aspect ratio
      const aspectRatio = asset.height / asset.width;
      const displayWidth = IMAGE_CONTAINER_WIDTH;
      const displayHeight = displayWidth * aspectRatio;
      setDisplaySize({ width: displayWidth, height: displayHeight });

      triggerToast('Image Loaded', 'Tap or drag on the image to pick colors', 'success', 2500);
    }
  };

  // Use refs so the PanResponder (created once) always reads current values
  const imageUriRef = useRef(null);
  const displaySizeRef = useRef({ width: 0, height: 0 });
  imageUriRef.current = imageUri;
  displaySizeRef.current = displaySize;

  const fetchColorRef = useRef(null);
  fetchColorRef.current = async (x, y) => {
    if (!imageUriRef.current || pickingRef.current) return null;
    pickingRef.current = true;

    try {
      const ds = displaySizeRef.current;
      const result = await getPixelColor(
        imageUriRef.current,
        x,
        y,
        ds.width,
        ds.height
      );

      const color = tinycolor({ r: result.r, g: result.g, b: result.b });
      const hsl = color.toHsl();

      const colorData = {
        hex: result.hex,
        r: result.r,
        g: result.g,
        b: result.b,
        a: result.a,
        hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`,
        rgb: `rgb(${result.r}, ${result.g}, ${result.b})`,
        name: color.toName() || null,
        isLight: color.isLight(),
      };

      setPickedColor(colorData);
      return colorData;
    } catch (e) {
      console.log('Color pick error:', e);
    } finally {
      pickingRef.current = false;
    }
    return null;
  };

  const addToHistoryRef = useRef(null);
  addToHistoryRef.current = (colorData) => {
    if (!colorData) return;
    setColorHistory(prev => {
      const filtered = prev.filter(c => c.hex !== colorData.hex);
      return [colorData, ...filtered].slice(0, 20);
    });
  };

  const getTouchPos = (evt) => {
    const pageX = evt.nativeEvent.pageX;
    const pageY = evt.nativeEvent.pageY;
    const x = pageX - imageLayoutRef.current.x;
    const y = pageY - imageLayoutRef.current.y;
    const ds = displaySizeRef.current;
    return {
      x: Math.max(0, Math.min(x, ds.width)),
      y: Math.max(0, Math.min(y, ds.height)),
    };
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !!imageUriRef.current,
    onMoveShouldSetPanResponder: () => !!imageUriRef.current,
    onPanResponderGrant: (evt) => {
      // Re-measure position in case user scrolled
      imageViewRef.current?.measureInWindow((x, y) => {
        imageLayoutRef.current = { x, y };
      });
      setIsDragging(true);
      const pos = getTouchPos(evt);
      setMagnifierPos(pos);
      fetchColorRef.current(pos.x, pos.y);
    },
    onPanResponderMove: (evt) => {
      const pos = getTouchPos(evt);
      setMagnifierPos(pos);
      fetchColorRef.current(pos.x, pos.y);
    },
    onPanResponderRelease: async (evt) => {
      const pos = getTouchPos(evt);
      setMagnifierPos(pos);
      const colorData = await fetchColorRef.current(pos.x, pos.y);
      addToHistoryRef.current(colorData);
      setIsDragging(false);
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
    },
  })).current;

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const isNearTop = offsetY < 100;
    const hasScrollableContent = contentHeight > layoutHeight + 50;

    if (hasScrollableContent && isNearTop) {
      if (!showGoDown) {
        setShowGoDown(true);
        Animated.timing(goDownOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    } else {
      if (showGoDown) {
        Animated.timing(goDownOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setShowGoDown(false);
        });
      }
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const copyToClipboard = async (value, label) => {
    await Clipboard.setStringAsync(value);
    triggerToast('Copied', `${label}: ${value}`, 'success', 1500);
  };

  const textColorForBg = (hex) => {
    return tinycolor(hex).isLight() ? '#000000' : '#FFFFFF';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Color Picker</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!isDragging}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => {
          if (h > Dimensions.get('window').height && !showGoDown) {
            setShowGoDown(true);
            Animated.timing(goDownOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
          }
        }}
      >
        {/* Empty State */}
        {!imageUri && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="eyedropper" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No image selected</Text>
            <Text style={styles.emptyDesc}>
              Pick an image and tap to extract exact pixel colors
            </Text>
          </View>
        )}

        {/* Pick Image Button */}
        {!imageUri && (
          <TouchableOpacity style={styles.pickBtn} onPress={pickImage} activeOpacity={0.8}>
            <Ionicons name="image" size={22} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>Pick Image</Text>
          </TouchableOpacity>
        )}

        {/* Image with Tap */}
        {imageUri && (
          <>
            <View style={styles.imageSection}>
              <View style={styles.imageTapHint}>
                <MaterialCommunityIcons name="gesture-tap" size={16} color={accent} />
                <Text style={styles.tapHintText}>Tap or drag on the image to pick colors</Text>
              </View>

              <View
                ref={imageViewRef}
                style={[styles.imageContainer, { height: displaySize.height }]}
                onLayout={() => {
                  imageViewRef.current?.measureInWindow((x, y) => {
                    imageLayoutRef.current = { x, y };
                  });
                }}
                {...panResponder.panHandlers}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: displaySize.width, height: displaySize.height }}
                  resizeMode="contain"
                />

                {/* Crosshair pointer — fills with picked color */}
                {magnifierPos && (
                  <View
                    style={[
                      styles.crosshair,
                      {
                        left: magnifierPos.x - 15,
                        top: magnifierPos.y - 15,
                        backgroundColor: pickedColor ? pickedColor.hex : 'transparent',
                        borderColor: pickedColor ? textColorForBg(pickedColor.hex) : '#fff',
                      },
                    ]}
                  />
                )}
              </View>
            </View>

            {/* Change Image */}
            <TouchableOpacity style={styles.changeBtn} onPress={pickImage} activeOpacity={0.8}>
              <Ionicons name="image" size={18} color={colors.textPrimary} />
              <Text style={styles.changeBtnText}>Change Image</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Color Result */}
        {pickedColor && (
          <View style={styles.resultSection}>
            {/* Large Color Preview */}
            <View style={[styles.colorPreview, { backgroundColor: pickedColor.hex }]}>
              <Text style={[styles.colorPreviewHex, { color: textColorForBg(pickedColor.hex) }]}>
                {pickedColor.hex}
              </Text>
              {pickedColor.name && (
                <Text style={[styles.colorPreviewName, { color: textColorForBg(pickedColor.hex) + 'CC' }]}>
                  {pickedColor.name}
                </Text>
              )}
            </View>

            {/* Color Values - Tappable to Copy */}
            <View style={styles.colorValues}>
              <TouchableOpacity
                style={styles.colorValueRow}
                onPress={() => copyToClipboard(pickedColor.hex, 'HEX')}
                activeOpacity={0.7}
              >
                <Text style={styles.colorValueLabel}>HEX</Text>
                <Text style={styles.colorValueText}>{pickedColor.hex}</Text>
                <Ionicons name="copy" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.colorValueRow}
                onPress={() => copyToClipboard(pickedColor.rgb, 'RGB')}
                activeOpacity={0.7}
              >
                <Text style={styles.colorValueLabel}>RGB</Text>
                <Text style={styles.colorValueText}>{pickedColor.rgb}</Text>
                <Ionicons name="copy" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.colorValueRow}
                onPress={() => copyToClipboard(pickedColor.hsl, 'HSL')}
                activeOpacity={0.7}
              >
                <Text style={styles.colorValueLabel}>HSL</Text>
                <Text style={styles.colorValueText}>{pickedColor.hsl}</Text>
                <Ionicons name="copy" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.colorValueRow, { borderBottomWidth: 0 }]}
                onPress={() => copyToClipboard(`rgba(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b}, ${(pickedColor.a / 255).toFixed(2)})`, 'RGBA')}
                activeOpacity={0.7}
              >
                <Text style={styles.colorValueLabel}>RGBA</Text>
                <Text style={styles.colorValueText}>
                  rgba({pickedColor.r}, {pickedColor.g}, {pickedColor.b}, {(pickedColor.a / 255).toFixed(2)})
                </Text>
                <Ionicons name="copy" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Color History */}
        {colorHistory.length > 1 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Colors</Text>
            <View style={styles.historyGrid}>
              {colorHistory.map((c, i) => (
                <TouchableOpacity
                  key={`${c.hex}-${i}`}
                  style={[styles.historyItem, { backgroundColor: c.hex }]}
                  onPress={() => {
                    setPickedColor(c);
                    copyToClipboard(c.hex, 'HEX');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.historyHex, { color: textColorForBg(c.hex) }]}>
                    {c.hex}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Go Down Button */}
      {showGoDown && (
        <Animated.View style={[styles.goDownWrapper, { opacity: goDownOpacity }]}>
          <TouchableOpacity style={styles.goDownBtn} onPress={scrollToBottom} activeOpacity={0.8}>
            <Text style={styles.goDownText}>Go Down</Text>
            <Ionicons name="arrow-down" size={18} color={isDark ? '#000' : '#fff'} />
          </TouchableOpacity>
        </Animated.View>
      )}
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
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  backBtn: {
    marginRight: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
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

  // Image Section
  imageSection: {
    marginTop: 16,
  },
  imageTapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    backgroundColor: accent + '15',
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  tapHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: accent,
  },
  imageContainer: {
    width: IMAGE_CONTAINER_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  crosshair: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  // Change Button
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 60,
    paddingVertical: 14,
    marginTop: 12,
    gap: 8,
  },
  changeBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Result Section
  resultSection: {
    marginTop: 16,
  },
  colorPreview: {
    borderRadius: 54,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  colorPreviewHex: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  colorPreviewName: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  colorValues: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
    overflow: 'hidden',
  },
  colorValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  colorValueLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: accent,
    width: 40,
  },
  colorValueText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // History Section
  historySection: {
    marginTop: 20,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyItem: {
    width: (IMAGE_CONTAINER_WIDTH - 24) / 4,
    height: 50,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyHex: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Go Down Button
  goDownWrapper: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
  goDownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal:50,
    paddingVertical:20,
    backgroundColor: isDark ? '#fff' : '#000',
    borderRadius: 50,
    elevation: 16,
  },
  goDownText: {
    color: isDark ? '#000' : '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ImageColorPicker;
