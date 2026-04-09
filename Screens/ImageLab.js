import { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Modal,
  TextInput,
  PermissionsAndroid,
} from 'react-native';
import Svg, { Circle, Rect, Polygon, Path, Line } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Paths } from 'expo-file-system';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#1565C0';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 40;

const SHAPES = [
  { key: 'circle', label: 'Circle', icon: 'circle-outline' },
  { key: 'square', label: 'Square', icon: 'square-outline' },
  { key: 'triangle', label: 'Triangle', icon: 'triangle-outline' },
  { key: 'hexagon', label: 'Hexagon', icon: 'hexagon-outline' },
  { key: 'pentagon', label: 'Pentagon', icon: 'pentagon-outline' },
  { key: 'octagon', label: 'Octagon', icon: 'octagon-outline' },
  { key: 'halfCircle', label: 'Half', icon: 'circle-half-full' },
];

const COLORS = ['#000000', '#FF0000', '#0000FF', '#00AA00', '#FF6600', '#9C27B0', '#FFFFFF', '#FFEB3B', '#00BCD4', '#FF4081'];

// Draggable item component
const DraggableItem = ({ item, onUpdate, onSelect, isSelected, canvasHeight }) => {
  const pan = useRef({ x: item.x, y: item.y });
  const scaleRef = useRef(item.scale || 1);
  const rotRef = useRef(item.rotation || 0);
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const hasMoved = useRef(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
    onPanResponderGrant: () => { hasMoved.current = false; },
    onPanResponderMove: (_, gs) => {
      hasMoved.current = true;
      setPos({ x: pan.current.x + gs.dx, y: pan.current.y + gs.dy });
    },
    onPanResponderRelease: (_, gs) => {
      if (hasMoved.current) {
        pan.current = { x: pan.current.x + gs.dx, y: pan.current.y + gs.dy };
        onUpdate({ ...item, x: pan.current.x, y: pan.current.y });
      } else {
        onSelect();
      }
    },
  }), []);

  const w = (item.width || 80) * (item.scale || 1);
  const h = (item.height || 80) * (item.scale || 1);

  return (
    <View
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        borderWidth: isSelected ? 1.5 : 0,
        borderColor: ACCENT,
        borderStyle: 'dashed',
        transform: [{ rotate: `${item.rotation || 0}deg` }],
      }}
      {...panResponder.panHandlers}
    >
      {item.type === 'image' && (
        <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%', borderRadius: 4 }} resizeMode="contain" />
      )}
      {item.type === 'text' && (
        <Text style={{ color: item.color, fontSize: item.fontSize * (item.scale || 1), fontWeight: item.bold ? '900' : '400', textAlign: 'center' }}>
          {item.text}
        </Text>
      )}
      {item.type === 'shape' && (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {renderShape(item.shape, w, h, item.color, item.fill)}
        </Svg>
      )}
    </View>
  );
};

const renderShape = (shape, w, h, color, fill) => {
  const strokeW = 3;
  const fillColor = fill ? color : 'none';
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - strokeW;

  switch (shape) {
    case 'circle':
      return <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    case 'square':
      return <Rect x={strokeW} y={strokeW} width={w - strokeW * 2} height={h - strokeW * 2} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    case 'triangle': {
      const pts = `${cx},${strokeW} ${w - strokeW},${h - strokeW} ${strokeW},${h - strokeW}`;
      return <Polygon points={pts} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    }
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(' ');
      return <Polygon points={pts} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    }
    case 'pentagon': {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const angle = (2 * Math.PI / 5) * i - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(' ');
      return <Polygon points={pts} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    }
    case 'octagon': {
      const pts = Array.from({ length: 8 }, (_, i) => {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(' ');
      return <Polygon points={pts} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    }
    case 'halfCircle': {
      const d = `M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy} Z`;
      return <Path d={d} stroke={color} strokeWidth={strokeW} fill={fillColor} />;
    }
    default:
      return null;
  }
};

const ImageLab = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const canvasRef = useRef(null);

  const [baseImage, setBaseImage] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Tool modals
  const [shapeModalVisible, setShapeModalVisible] = useState(false);
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Text input
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#000000');
  const [textSize, setTextSize] = useState(18);
  const [textBold, setTextBold] = useState(false);

  // Shape
  const [shapeColor, setShapeColor] = useState('#000000');
  const [shapeFill, setShapeFill] = useState(false);

  const canvasHeight = baseImage ? (CANVAS_WIDTH / baseImage.width) * baseImage.height : CANVAS_WIDTH;

  const pickBaseImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { triggerToast('Permission', 'Gallery access needed', 'alert', 2000); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled) return;
    setBaseImage(res.assets[0]);
    setItems([]);
    setSelectedIdx(null);
    setResult(null);
  };

  const addOverlayImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const newItem = {
      type: 'image', uri: res.assets[0].uri,
      x: CANVAS_WIDTH / 2 - 50, y: canvasHeight / 2 - 50,
      width: 100, height: 100, scale: 1, rotation: 0, id: Date.now(),
    };
    setItems(prev => [...prev, newItem]);
    setSelectedIdx(items.length);
  };

  const addText = () => {
    if (!textInput.trim()) { setTextModalVisible(false); return; }
    const newItem = {
      type: 'text', text: textInput, color: textColor, fontSize: textSize, bold: textBold,
      x: CANVAS_WIDTH / 2 - 40, y: canvasHeight / 2 - 15,
      width: 120, height: 40, scale: 1, rotation: 0, id: Date.now(),
    };
    setItems(prev => [...prev, newItem]);
    setSelectedIdx(items.length);
    setTextInput('');
    setTextModalVisible(false);
  };

  const addShape = (shapeKey) => {
    const newItem = {
      type: 'shape', shape: shapeKey, color: shapeColor, fill: shapeFill,
      x: CANVAS_WIDTH / 2 - 40, y: canvasHeight / 2 - 40,
      width: 80, height: 80, scale: 1, rotation: 0, id: Date.now(),
    };
    setItems(prev => [...prev, newItem]);
    setSelectedIdx(items.length);
    setShapeModalVisible(false);
  };

  const updateItem = useCallback((updated) => {
    setItems(prev => prev.map(it => it.id === updated.id ? updated : it));
  }, []);

  const removeSelected = () => {
    if (selectedIdx === null) return;
    setItems(prev => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const resizeSelected = (delta) => {
    if (selectedIdx === null) return;
    setItems(prev => prev.map((it, i) => {
      if (i !== selectedIdx) return it;
      const newScale = Math.max(0.3, Math.min(5, (it.scale || 1) + delta));
      return { ...it, scale: newScale };
    }));
  };

  const rotateSelected = (deg) => {
    if (selectedIdx === null) return;
    setItems(prev => prev.map((it, i) => {
      if (i !== selectedIdx) return it;
      return { ...it, rotation: ((it.rotation || 0) + deg) % 360 };
    }));
  };

  const recolorSelected = (color) => {
    if (selectedIdx === null) return;
    setItems(prev => prev.map((it, i) => {
      if (i !== selectedIdx) return it;
      return { ...it, color };
    }));
    setColorModalVisible(false);
  };

  const toggleFillSelected = () => {
    if (selectedIdx === null) return;
    setItems(prev => prev.map((it, i) => {
      if (i !== selectedIdx) return it;
      return { ...it, fill: !it.fill };
    }));
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const uri = await captureRef(canvasRef, { format: 'png', quality: 1, result: 'tmpfile', pixelRatio: 4 });
      setResult(uri);
      setSelectedIdx(null);
      triggerToast('Success', 'Image ready to save', 'success', 2000);
    } catch (e) {
      triggerToast('Error', 'Failed to save', 'error', 2000);
    } finally {
      setSaving(false);
    }
  };

  const saveToDevice = async () => {
    if (!result) return;
    setSaving(true);
    try {
      if (Platform.OS === 'android' && Platform.Version < 29) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      }
      await saveToDownloads(result.replace('file://', ''), `ToolsApp_ImageLab_${Date.now()}.png`, 'image/png');
      triggerToast('Saved', 'Image saved to Downloads', 'success', 2000);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 2000);
    } finally {
      setSaving(false);
    }
  };

  const shareImage = async () => {
    if (!result) return;
    await Sharing.shareAsync(result, { mimeType: 'image/png' });
  };

  const selectedItem = selectedIdx !== null ? items[selectedIdx] : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Image Lab</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        {!baseImage && (
          <View style={styles.emptyState}>
            <FontAwesome name="object-group" size={56} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>Image Lab</Text>
            <Text style={styles.emptyDesc}>
              Pick an image to start adding overlays, text, and shapes
            </Text>
          </View>
        )}

        {/* Canvas */}
        {baseImage && (
          <View
            ref={canvasRef}
            collapsable={false}
            style={[styles.canvas, { height: canvasHeight }]}
            onTouchEnd={() => setSelectedIdx(null)}
          >
            <Image source={{ uri: baseImage.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />

            {items.map((item, idx) => (
              <DraggableItem
                key={item.id}
                item={item}
                isSelected={selectedIdx === idx}
                canvasHeight={canvasHeight}
                onUpdate={updateItem}
                onSelect={() => setSelectedIdx(idx)}
              />
            ))}
          </View>
        )}

        {/* Pick Base Image */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickBaseImage} activeOpacity={0.8}>
          <Ionicons name="image" size={22} color={colors.textPrimary} />
          <Text style={styles.pickBtnText}>{baseImage ? 'Change Image' : 'Pick Image'}</Text>
        </TouchableOpacity>

        {/* Tools — only when image selected */}
        {baseImage && !result && (
          <>
            {/* Add tools row */}
            <View style={styles.toolsRow}>
              <TouchableOpacity style={styles.toolBtn} onPress={addOverlayImage}>
                <MaterialIcons name="add-photo-alternate" size={22} color={ACCENT} />
                <Text style={styles.toolLabel}>Image</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} onPress={() => { setTextInput(''); setTextModalVisible(true); }}>
                <MaterialIcons name="text-fields" size={22} color={ACCENT} />
                <Text style={styles.toolLabel}>Text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} onPress={() => setShapeModalVisible(true)}>
                <MaterialCommunityIcons name="shape-outline" size={22} color={ACCENT} />
                <Text style={styles.toolLabel}>Shape</Text>
              </TouchableOpacity>
            </View>

            {/* Selected item controls */}
            {selectedItem && (
              <View style={styles.controlsCard}>
                <Text style={styles.controlsTitle}>
                  {selectedItem.type === 'text' ? `"${selectedItem.text}"` : selectedItem.type === 'shape' ? selectedItem.shape : 'Image'} selected
                </Text>
                <View style={styles.controlsRow}>
                  <TouchableOpacity style={styles.ctrlBtn} onPress={() => resizeSelected(0.1)}>
                    <Ionicons name="add" size={20} color={colors.textPrimary} />
                    <Text style={styles.ctrlLabel}>Bigger</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ctrlBtn} onPress={() => resizeSelected(-0.1)}>
                    <Ionicons name="remove" size={20} color={colors.textPrimary} />
                    <Text style={styles.ctrlLabel}>Smaller</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ctrlBtn} onPress={() => rotateSelected(15)}>
                    <MaterialIcons name="rotate-right" size={20} color={colors.textPrimary} />
                    <Text style={styles.ctrlLabel}>Rotate</Text>
                  </TouchableOpacity>
                  {(selectedItem.type === 'shape' || selectedItem.type === 'text') && (
                    <TouchableOpacity style={styles.ctrlBtn} onPress={() => setColorModalVisible(true)}>
                      <Ionicons name="color-palette" size={20} color={colors.textPrimary} />
                      <Text style={styles.ctrlLabel}>Color</Text>
                    </TouchableOpacity>
                  )}
                  {selectedItem.type === 'shape' && (
                    <TouchableOpacity style={styles.ctrlBtn} onPress={toggleFillSelected}>
                      <MaterialCommunityIcons name={selectedItem.fill ? 'square' : 'square-outline'} size={20} color={colors.textPrimary} />
                      <Text style={styles.ctrlLabel}>{selectedItem.fill ? 'Outline' : 'Fill'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: '#F4433620' }]} onPress={removeSelected}>
                    <Ionicons name="trash" size={20} color="#F44336" />
                    <Text style={[styles.ctrlLabel, { color: '#F44336' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveMainBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={22} color="#fff" />}
              <Text style={styles.saveMainBtnText}>{saving ? 'Saving...' : 'Save Image'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={24} color={ACCENT} />
              <Text style={styles.successText}>Image Ready!</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.saveDlBtn} onPress={saveToDevice} disabled={saving} activeOpacity={0.8}>
                <Ionicons name="download" size={20} color={colors.saveBtnText} />
                <Text style={styles.saveDlBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareImage} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setResult(null); }} activeOpacity={0.8}>
              <Ionicons name="pencil" size={18} color={ACCENT} />
              <Text style={styles.retryBtnText}>Continue Editing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newBtn} onPress={() => { setBaseImage(null); setItems([]); setResult(null); }} activeOpacity={0.8}>
              <MaterialIcons name="add-photo-alternate" size={18} color={colors.textPrimary} />
              <Text style={styles.newBtnText}>New Image</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Text Modal */}
      <Modal visible={textModalVisible} transparent animationType="fade" onRequestClose={() => setTextModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Text</Text>
            <TextInput
              style={styles.modalInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Enter text..."
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            <View style={styles.modalColorRow}>
              {COLORS.slice(0, 6).map(c => (
                <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotActive]} onPress={() => setTextColor(c)} />
              ))}
            </View>
            <View style={styles.modalOptionsRow}>
              <TouchableOpacity style={[styles.optionChip, textBold && { backgroundColor: ACCENT }]} onPress={() => setTextBold(b => !b)}>
                <Text style={[styles.optionChipText, textBold && { color: '#fff' }]}>Bold</Text>
              </TouchableOpacity>
              {[14, 18, 24, 32].map(s => (
                <TouchableOpacity key={s} style={[styles.optionChip, textSize === s && { backgroundColor: ACCENT }]} onPress={() => setTextSize(s)}>
                  <Text style={[styles.optionChipText, textSize === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setTextModalVisible(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, !textInput.trim() && { opacity: 0.4 }]} onPress={addText} disabled={!textInput.trim()}>
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Shape Modal */}
      <Modal visible={shapeModalVisible} transparent animationType="fade" onRequestClose={() => setShapeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Shape</Text>
            <View style={styles.modalColorRow}>
              {COLORS.slice(0, 6).map(c => (
                <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, shapeColor === c && styles.colorDotActive]} onPress={() => setShapeColor(c)} />
              ))}
            </View>
            <TouchableOpacity style={[styles.optionChip, shapeFill && { backgroundColor: ACCENT }, { alignSelf: 'flex-start', marginBottom: 12 }]} onPress={() => setShapeFill(f => !f)}>
              <Text style={[styles.optionChipText, shapeFill && { color: '#fff' }]}>Filled</Text>
            </TouchableOpacity>
            <View style={styles.shapesGrid}>
              {SHAPES.map(s => (
                <TouchableOpacity key={s.key} style={styles.shapeBtn} onPress={() => addShape(s.key)}>
                  <MaterialCommunityIcons name={s.icon} size={32} color={shapeColor} />
                  <Text style={styles.shapeBtnLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShapeModalVisible(false)} style={{ alignSelf: 'center', paddingVertical: 10 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Color Picker Modal */}
      <Modal visible={colorModalVisible} transparent animationType="fade" onRequestClose={() => setColorModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Pick Color</Text>
            <View style={styles.colorsGrid}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} style={[styles.colorDotLarge, { backgroundColor: c }]} onPress={() => recolorSelected(c)} />
              ))}
            </View>
            <TouchableOpacity onPress={() => setColorModalVisible(false)} style={{ alignSelf: 'center', paddingVertical: 10 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.textTertiary, marginTop: 20 },
    emptyDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },

    canvas: {
      width: CANVAS_WIDTH, borderRadius: 12, overflow: 'hidden', marginTop: 10,
      backgroundColor: isDark ? '#222' : '#f0f0f0',
      elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6,
    },

    pickBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.pickBg, borderWidth: 2, borderColor: colors.pickBorder,
      borderStyle: 'dashed', borderRadius: 60, paddingVertical: 16, marginTop: 16, gap: 10,
    },
    pickBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

    toolsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
    toolBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
      backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderWidth: 1, borderColor: isDark ? '#333' : '#e0e0e0',
    },
    toolLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },

    controlsCard: {
      marginTop: 14, padding: 14, borderRadius: 16,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5', borderWidth: 1, borderColor: isDark ? '#333' : '#e0e0e0',
    },
    controlsTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 10, textTransform: 'capitalize' },
    controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    ctrlBtn: {
      alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
      backgroundColor: isDark ? '#222' : '#e8e8e8',
    },
    ctrlLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

    saveMainBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, borderRadius: 60, paddingVertical: 16, marginTop: 20, gap: 10,
    },
    saveMainBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    resultSection: { marginTop: 16 },
    successBadge: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT + '20', borderRadius: 60, borderWidth: 1, borderColor: ACCENT + '40',
      paddingVertical: 14, gap: 10,
    },
    successText: { color: ACCENT, fontSize: 16, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    saveDlBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.saveBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
    },
    saveDlBtnText: { color: colors.saveBtnText, fontSize: 16, fontWeight: '700' },
    shareBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.shareBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
    },
    shareBtnText: { color: colors.shareBtnText, fontSize: 16, fontWeight: '700' },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? '#fff' : ACCENT, borderRadius: 60, paddingVertical: 14, marginTop: 12, gap: 8,
    },
    retryBtnText: { fontSize: 15, fontWeight: '700', color: isDark ? ACCENT : '#fff' },
    newBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? '#222' : '#f0f0f0', borderRadius: 60, paddingVertical: 14, marginTop: 10, gap: 8,
    },
    newBtnText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    modalBox: { width: '85%', backgroundColor: colors.card, borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
    modalInput: {
      backgroundColor: isDark ? '#222' : '#f5f5f5', borderRadius: 12, padding: 14, fontSize: 16,
      color: colors.textPrimary, marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#333' : '#e0e0e0',
    },
    modalColorRow: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
    colorDotActive: { borderColor: ACCENT, borderWidth: 3 },
    modalOptionsRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    optionChip: {
      paddingVertical: 6, paddingHorizontal: 14, borderRadius: 60,
      backgroundColor: isDark ? '#333' : '#e0e0e0',
    },
    optionChipText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center' },
    modalCancel: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    modalConfirm: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 60, backgroundColor: ACCENT },
    modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    shapesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    shapeBtn: {
      alignItems: 'center', justifyContent: 'center', width: 70, paddingVertical: 12,
      borderRadius: 14, backgroundColor: isDark ? '#222' : '#f0f0f0',
    },
    shapeBtnLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },

    colorsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
    colorDotLarge: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: isDark ? '#444' : '#ddd' },
  });

export default ImageLab;
