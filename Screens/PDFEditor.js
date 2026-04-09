import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  Modal,
  TextInput,
  PanResponder,
  Share,
  PermissionsAndroid,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Paths } from 'expo-file-system';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import { renderPage, getPdfInfo, createPdfFromImages } from '../modules/pdf-tools';
import { saveToDownloads } from '../modules/zip-tools';

const ACCENT = '#5C6BC0';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_WIDTH = SCREEN_WIDTH - 40;

const COLORS = ['#000000', '#FF0000', '#0000FF', '#00AA00', '#FF6600', '#9C27B0', '#FFFFFF'];
const STROKE_SIZES = [2, 4, 6, 8];
const HIGHLIGHT_COLORS = ['#FFEB3B50', '#4CAF5050', '#2196F350', '#F4433650', '#FF980050'];

const TOOLS = [
  { key: 'draw', icon: 'brush', label: 'Draw', lib: 'MaterialIcons' },
  { key: 'highlight', icon: 'format-color-fill', label: 'Highlight', lib: 'MaterialIcons' },
  { key: 'text', icon: 'format-color-text', label: 'Text', lib: 'MaterialIcons' },
  { key: 'image', icon: 'image', label: 'Image', lib: 'MaterialIcons' },
  { key: 'signature', icon: 'draw', label: 'Sign', lib: 'MaterialCommunityIcons' },
  { key: 'eraser', icon: 'eraser', label: 'Eraser', lib: 'MaterialCommunityIcons' },
  { key: 'rotate', icon: 'rotate-right', label: 'Rotate', lib: 'MaterialIcons' },
  { key: 'delete', icon: 'delete-outline', label: 'Delete', lib: 'MaterialIcons' },
  { key: 'rename', icon: 'rename-box', label: 'Rename', lib: 'MaterialCommunityIcons' },
];

// Draggable text component with tap-to-edit
const DraggableText = ({ item, index, onUpdate, onEdit, isPositioning }) => {
  const pan = useRef({ x: item.x, y: item.y });
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const scaleRef = useRef(item.scale || 1);
  const [scale, setScale] = useState(item.scale || 1);
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const hasMoved = useRef(false);
  const isPinching = useRef(false);

  // Sync with prop changes (after edit)
  useEffect(() => {
    pan.current = { x: item.x, y: item.y };
    setPos({ x: item.x, y: item.y });
    scaleRef.current = item.scale || 1;
    setScale(item.scale || 1);
  }, [item.x, item.y, item.scale]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
    onPanResponderGrant: (e) => {
      hasMoved.current = false;
      isPinching.current = false;
      const touches = e.nativeEvent.touches;
      if (touches && touches.length === 2) {
        isPinching.current = true;
        const dx = touches[1].pageX - touches[0].pageX;
        const dy = touches[1].pageY - touches[0].pageY;
        initialDistance.current = Math.sqrt(dx * dx + dy * dy);
        initialScale.current = scaleRef.current;
      }
    },
    onPanResponderMove: (e, gs) => {
      const touches = e.nativeEvent.touches;
      if (touches && touches.length === 2) {
        isPinching.current = true;
        hasMoved.current = true;
        const dx = touches[1].pageX - touches[0].pageX;
        const dy = touches[1].pageY - touches[0].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (initialDistance.current > 0) {
          const newScale = Math.max(0.5, Math.min(4, initialScale.current * (dist / initialDistance.current)));
          scaleRef.current = newScale;
          setScale(newScale);
        }
      } else if (!isPinching.current) {
        hasMoved.current = true;
        setPos({ x: pan.current.x + gs.dx, y: pan.current.y + gs.dy });
      }
    },
    onPanResponderRelease: (_, gs) => {
      if (!hasMoved.current && !isPinching.current) {
        // It was a tap — open editor
        onEdit(index);
      } else if (!isPinching.current) {
        pan.current = { x: pan.current.x + gs.dx, y: pan.current.y + gs.dy };
        onUpdate(index, { x: pan.current.x, y: pan.current.y, scale: scaleRef.current });
      } else {
        onUpdate(index, { x: pan.current.x, y: pan.current.y, scale: scaleRef.current });
      }
      isPinching.current = false;
    },
  }), []);

  const fontWeight = item.bold ? '900' : '400';

  return (
    <View
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: [{ scale }],
        borderWidth: 1,
        borderColor: isPositioning ? ACCENT + '60' : 'transparent',
        borderStyle: 'dashed',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        backgroundColor: isPositioning ? '#ffffff15' : 'transparent',
      }}
      {...panResponder.panHandlers}
    >
      <Text style={{ color: item.color, fontSize: item.size, fontWeight }}>
        {item.text}
      </Text>
    </View>
  );
};

// Draggable signature component
const DraggableSignature = ({ item, index, onUpdate, onEdit, isPositioning }) => {
  const pan = useRef({ x: item.x, y: item.y });
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const hasMoved = useRef(false);

  useEffect(() => {
    pan.current = { x: item.x, y: item.y };
    setPos({ x: item.x, y: item.y });
  }, [item.x, item.y]);

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
        onUpdate(index, { x: pan.current.x, y: pan.current.y });
      } else {
        onEdit(index);
      }
    },
  }), []);

  return (
    <View
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: 150,
        height: 75,
        borderWidth: 1,
        borderColor: isPositioning ? ACCENT + '60' : 'transparent',
        borderStyle: 'dashed',
        borderRadius: 4,
        backgroundColor: isPositioning ? '#ffffff15' : 'transparent',
      }}
      {...panResponder.panHandlers}
    >
      <Svg style={{ width: 150, height: 75 }} viewBox={`0 0 ${SCREEN_WIDTH * 0.9 - 48} 160`}>
        {item.paths.map((sp, j) => (
          sp.d ? <Path key={j} d={sp.d} stroke="#000" strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null
        ))}
      </Svg>
    </View>
  );
};

// Draggable image component
const DraggableImage = ({ item, index, onUpdate, onEdit, isPositioning }) => {
  const pan = useRef({ x: item.x, y: item.y });
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const [size, setSize] = useState({ w: item.width, h: item.height });
  const hasMoved = useRef(false);

  useEffect(() => {
    pan.current = { x: item.x, y: item.y };
    setPos({ x: item.x, y: item.y });
    setSize({ w: item.width, h: item.height });
  }, [item.x, item.y, item.width, item.height]);

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
        onUpdate(index, { x: pan.current.x, y: pan.current.y });
      } else {
        onEdit(index);
      }
    },
  }), []);

  return (
    <View
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        borderWidth: 1,
        borderColor: isPositioning ? ACCENT + '60' : 'transparent',
        borderStyle: 'dashed',
        padding: 2,
        borderRadius: 4,
        backgroundColor: isPositioning ? '#ffffff15' : 'transparent',
      }}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri: item.uri }} style={{ width: size.w, height: size.h, borderRadius: 4 }} resizeMode="contain" />
    </View>
  );
};

const PDFEditor = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // PDF state
  const [pdfUri, setPdfUri] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageImages, setPageImages] = useState({});
  const [loading, setLoading] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [dontShowWarning, setDontShowWarning] = useState(false);

  // Load warning preference
  useEffect(() => {
    AsyncStorage.getItem('pdfEditorWarningDismissed').then(val => {
      if (val === 'true') setDontShowWarning(true);
    }).catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [result, setResult] = useState(null);

  // Pages state (for delete/rotate tracking)
  const [pages, setPages] = useState([]); // [{index, rotation, deleted}]

  // Tool state
  const [activeTool, setActiveTool] = useState(null);
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeSize, setStrokeSize] = useState(4);
  const [highlightColor, setHighlightColor] = useState('#FFEB3B80');

  // Annotations per page: { [pageIndex]: { paths:[], texts:[], highlights:[], images:[] } }
  const [annotations, setAnnotations] = useState({});
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Drawing state
  const currentPath = useRef('');
  const pointsRef = useRef([]);
  const [drawingPaths, setDrawingPaths] = useState([]);

  // Refs to avoid stale closures in PanResponder
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const drawColorRef = useRef(drawColor);
  drawColorRef.current = drawColor;
  const strokeSizeRef = useRef(strokeSize);
  strokeSizeRef.current = strokeSize;
  const highlightColorRef = useRef(highlightColor);
  highlightColorRef.current = highlightColor;
  const placingSignatureRef = useRef(placingSignature);
  placingSignatureRef.current = placingSignature;
  const signatureDataRef = useRef(signatureData);
  signatureDataRef.current = signatureData;
  const placingImageRef = useRef(placingImage);
  placingImageRef.current = placingImage;

  // Text modal
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#000000');
  const [textSize, setTextSize] = useState(16);
  const [textBold, setTextBold] = useState(false);
  const [editingTextIndex, setEditingTextIndex] = useState(null); // null = adding new, number = editing existing
  const [positioningItem, setPositioningItem] = useState(null); // { type: 'text'|'signature'|'image', index }
  const [moveStep, setMoveStep] = useState(5); // pixels per arrow press

  // Signature edit modal
  const [signEditModalVisible, setSignEditModalVisible] = useState(false);
  const [editingSignIndex, setEditingSignIndex] = useState(null);

  // Image edit modal
  const [imageEditModalVisible, setImageEditModalVisible] = useState(false);
  const [editingImageIndex, setEditingImageIndex] = useState(null);
  const [editImageWidth, setEditImageWidth] = useState(100);
  const [editImageHeight, setEditImageHeight] = useState(100);

  // Signature modal
  const [signModalVisible, setSignModalVisible] = useState(false);
  const signPath = useRef('');
  const [signPaths, setSignPaths] = useState([]); // completed strokes
  const signPathsRef = useRef([]);
  const [activeSignPath, setActiveSignPath] = useState(''); // stroke being drawn
  const [placingSignature, setPlacingSignature] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  // Image placement
  const [placingImage, setPlacingImage] = useState(null);

  // Page capture refs
  const pageRef = useRef(null);

  // Color/size picker visibility
  const [showOptions, setShowOptions] = useState(false);

  const getAnnotations = useCallback((pageIdx) => {
    return annotations[pageIdx] || { paths: [], texts: [], highlights: [], images: [], signatures: [] };
  }, [annotations]);

  const updateAnnotations = useCallback((pageIdx, updater) => {
    setAnnotations(prev => {
      // Save current state to undo stack
      setUndoStack(stack => [...stack, JSON.parse(JSON.stringify(prev))]);
      setRedoStack([]); // Clear redo on new action
      const current = prev[pageIdx] || { paths: [], texts: [], highlights: [], images: [], signatures: [] };
      return { ...prev, [pageIdx]: updater(current) };
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(stack => [...stack, JSON.parse(JSON.stringify(annotations))]);
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(stack => stack.slice(0, -1));
    setAnnotations(prev);
  }, [undoStack, annotations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(stack => [...stack, JSON.parse(JSON.stringify(annotations))]);
    const next = redoStack[redoStack.length - 1];
    setRedoStack(stack => stack.slice(0, -1));
    setAnnotations(next);
  }, [redoStack, annotations]);

  // Pick PDF
  const handlePickPdf = () => {
    if (dontShowWarning) {
      pickPdf();
    } else {
      setWarningModalVisible(true);
    }
  };

  const handleDontShowWarning = (checked) => {
    setDontShowWarning(checked);
    AsyncStorage.setItem('pdfEditorWarningDismissed', checked ? 'true' : 'false').catch(() => {});
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled) return;
    const file = res.assets[0];

    setLoading(true);
    setPdfUri(file.uri);
    setPdfName(file.name);
    setAnnotations({});
    setResult(null);
    setCurrentPage(0);
    setActiveTool(null);
    setPageImages({});

    try {
      const info = await getPdfInfo(file.uri);
      setPageCount(info.pageCount);
      setPages(Array.from({ length: info.pageCount }, (_, i) => ({ index: i, rotation: 0, deleted: false })));

      // Render first page
      const base64 = await renderPage(file.uri, 0, 400);
      setPageImages({ 0: base64 });
    } catch (e) {
      triggerToast('Error', 'Failed to load PDF: ' + e.message, 'error', 3000);
      setPdfUri(null);
    } finally {
      setLoading(false);
    }
  };

  // Load page image on demand — keep max 3 pages in memory
  const loadPageImage = async (pageIdx) => {
    if (pageImages[pageIdx]) return;
    try {
      const base64 = await renderPage(pdfUri, pageIdx, 400);
      setPageImages(prev => {
        const keys = Object.keys(prev);
        const updated = { ...prev, [pageIdx]: base64 };
        // Evict oldest pages if more than 2 cached
        if (keys.length >= 2) {
          const toRemove = keys.filter(k => k !== String(pageIdx)).slice(0, keys.length - 1);
          toRemove.forEach(k => delete updated[k]);
        }
        return updated;
      });
    } catch (e) {
      triggerToast('Error', 'Failed to render page', 'error', 2000);
    }
  };

  // Navigate pages
  const goToPage = async (idx) => {
    // Skip deleted pages
    const activePages = pages.filter(p => !p.deleted);
    if (idx < 0 || idx >= activePages.length) return;
    const actualIdx = activePages[idx].index;
    setCurrentPage(idx);
    await loadPageImage(actualIdx);
  };

  const getActivePage = () => {
    const activePages = pages.filter(p => !p.deleted);
    return activePages[currentPage] || null;
  };

  const getActivePageCount = () => pages.filter(p => !p.deleted).length;

  // Helper to get active page from refs (for PanResponder)
  const getActivePageFromRef = () => {
    const activePages = pagesRef.current.filter(p => !p.deleted);
    return activePages[currentPageRef.current] || null;
  };

  // Build smooth SVG path from points using quadratic Bezier curves
  const buildSmoothPath = (points) => {
    if (points.length < 2) return `M${points[0].x},${points[0].y}`;
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      d += ` Q${prev.x},${prev.y} ${midX},${midY}`;
    }
    // Final line to the last point
    const last = points[points.length - 1];
    d += ` L${last.x},${last.y}`;
    return d;
  };

  // Ref for tap handler (set after handleCanvasTap is defined below)
  const handleCanvasTapRef = useRef(null);

  // Unified PanResponder - handles drawing, highlighting, and taps for text/sign/image/eraser
  const drawPanResponder = useMemo(() => {
    let isDrawing = false;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !!activeToolRef.current || placingSignatureRef.current || placingImageRef.current,
      onMoveShouldSetPanResponder: () => activeToolRef.current === 'draw' || activeToolRef.current === 'highlight',
      onPanResponderGrant: (e) => {
        const tool = activeToolRef.current;
        if (tool === 'draw' || tool === 'highlight') {
          isDrawing = true;
          const { locationX, locationY } = e.nativeEvent;
          pointsRef.current = [{ x: locationX, y: locationY }];
          currentPath.current = `M${locationX},${locationY}`;
        }
      },
      onPanResponderMove: (e) => {
        if (!isDrawing) return;
        const { locationX, locationY } = e.nativeEvent;
        pointsRef.current.push({ x: locationX, y: locationY });
        currentPath.current = buildSmoothPath(pointsRef.current);
        setDrawingPaths([{ d: currentPath.current }]);
      },
      onPanResponderRelease: (e) => {
        if (isDrawing) {
          const page = getActivePageFromRef();
          if (page && pointsRef.current.length > 0) {
            const pathData = buildSmoothPath(pointsRef.current);
            if (activeToolRef.current === 'draw') {
              updateAnnotations(page.index, (ann) => ({
                ...ann,
                paths: [...ann.paths, { d: pathData, color: drawColorRef.current, strokeWidth: strokeSizeRef.current }],
              }));
            } else if (activeToolRef.current === 'highlight') {
              updateAnnotations(page.index, (ann) => ({
                ...ann,
                highlights: [...ann.highlights, { d: pathData, color: highlightColorRef.current, strokeWidth: 20 }],
              }));
            }
          }
          currentPath.current = '';
          pointsRef.current = [];
          setDrawingPaths([]);
          isDrawing = false;
        } else {
          // It's a tap — handle text/eraser/signature/image placement
          handleCanvasTapRef.current?.(e);
        }
      },
    });
  }, []);

  // Parse path string to extract coordinates for hit-testing
  const getPathBounds = (pathD) => {
    const nums = pathD.match(/-?\d+\.?\d*/g);
    if (!nums || nums.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < nums.length - 1; i += 2) {
      const x = parseFloat(nums[i]);
      const y = parseFloat(nums[i + 1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  };

  const isPointNearPath = (px, py, pathD, threshold = 30) => {
    const bounds = getPathBounds(pathD);
    if (!bounds) return false;
    return px >= bounds.minX - threshold && px <= bounds.maxX + threshold &&
           py >= bounds.minY - threshold && py <= bounds.maxY + threshold;
  };

  // Handle tap for eraser only (text/sig/image use DraggableX components)
  const handleCanvasTap = (e) => {
    const { locationX, locationY } = e.nativeEvent;
    const page = getActivePageFromRef();
    if (!page) return;

    if (activeToolRef.current === 'eraser') {
      // Only erase highlights and drawings — find closest to tap
      updateAnnotations(page.index, (ann) => {
        // Check highlights first
        for (let i = ann.highlights.length - 1; i >= 0; i--) {
          if (isPointNearPath(locationX, locationY, ann.highlights[i].d)) {
            return { ...ann, highlights: ann.highlights.filter((_, idx) => idx !== i) };
          }
        }
        // Then drawings
        for (let i = ann.paths.length - 1; i >= 0; i--) {
          if (isPointNearPath(locationX, locationY, ann.paths[i].d)) {
            return { ...ann, paths: ann.paths.filter((_, idx) => idx !== i) };
          }
        }
        return ann;
      });
    }
  };
  handleCanvasTapRef.current = handleCanvasTap;

  // Add or edit text annotation
  const confirmText = () => {
    if (!textInput.trim()) {
      setTextModalVisible(false);
      setEditingTextIndex(null);
      return;
    }
    const page = getActivePageFromRef();
    if (!page) return;

    if (editingTextIndex !== null) {
      // Editing existing text
      updateAnnotations(page.index, (ann) => ({
        ...ann,
        texts: ann.texts.map((t, i) => i === editingTextIndex
          ? { ...t, text: textInput, color: textColor, size: textSize, bold: textBold }
          : t
        ),
      }));
      triggerToast('Text', 'Text updated', 'info', 1500);
      setPositioningItem({ type: 'text', index: editingTextIndex });
    } else {
      // Adding new text — center of page
      const pageAnnCurrent = annotations[page.index] || { paths: [], texts: [], highlights: [], images: [], signatures: [] };
      const newIndex = pageAnnCurrent.texts.length;
      updateAnnotations(page.index, (ann) => ({
        ...ann,
        texts: [...ann.texts, {
          text: textInput,
          x: PAGE_WIDTH / 2 - 40,
          y: (PAGE_WIDTH / 0.707) / 2 - 20,
          color: textColor,
          size: textSize,
          scale: 1,
          bold: textBold,
        }],
      }));
      setPositioningItem({ type: 'text', index: newIndex });
      triggerToast('Text', 'Use arrows to position', 'info', 2000);
    }
    setTextInput('');
    setTextModalVisible(false);
    setEditingTextIndex(null);
  };

  // Open editor for existing text
  const editTextAnnotation = (textIndex) => {
    setActiveTool(null);
    const page = getActivePageFromRef();
    if (!page) return;
    const ann = annotationsRef.current[page.index];
    if (!ann || !ann.texts[textIndex]) return;
    const t = ann.texts[textIndex];
    setTextInput(t.text);
    setTextColor(t.color);
    setTextSize(t.size);
    setTextBold(!!t.bold);
    setEditingTextIndex(textIndex);
    setTextModalVisible(true);
  };

  // Delete text annotation
  const deleteTextAnnotation = () => {
    if (editingTextIndex === null) return;
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      texts: ann.texts.filter((_, i) => i !== editingTextIndex),
    }));
    setTextInput('');
    setTextModalVisible(false);
    setEditingTextIndex(null);
    triggerToast('Text', 'Text deleted', 'info', 1500);
  };

  // Move any positioned item by arrow buttons
  const moveItem = (direction) => {
    if (!positioningItem) return;
    const page = getActivePageFromRef();
    if (!page) return;
    const delta = { x: 0, y: 0 };
    if (direction === 'up') delta.y = -moveStep;
    if (direction === 'down') delta.y = moveStep;
    if (direction === 'left') delta.x = -moveStep;
    if (direction === 'right') delta.x = moveStep;
    const { type, index } = positioningItem;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      [type === 'text' ? 'texts' : type === 'signature' ? 'signatures' : 'images']:
        ann[type === 'text' ? 'texts' : type === 'signature' ? 'signatures' : 'images'].map((item, i) =>
          i === index ? { ...item, x: item.x + delta.x, y: item.y + delta.y } : item
        ),
    }));
  };

  // Update text position/scale after drag or pinch
  const updateTextAnnotation = useCallback((textIndex, updates) => {
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      texts: ann.texts.map((t, i) => i === textIndex ? { ...t, ...updates } : t),
    }));
  }, []);

  const updateSignatureAnnotation = useCallback((sigIndex, updates) => {
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      signatures: ann.signatures.map((s, i) => i === sigIndex ? { ...s, ...updates } : s),
    }));
  }, []);

  const updateImageAnnotation = useCallback((imgIndex, updates) => {
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      images: ann.images.map((img, i) => i === imgIndex ? { ...img, ...updates } : img),
    }));
  }, []);

  // Signature edit — tap to open, delete
  const editSignAnnotation = (sigIndex) => {
    setActiveTool(null);
    setEditingSignIndex(sigIndex);
    setSignEditModalVisible(true);
  };

  const deleteSignAnnotation = () => {
    if (editingSignIndex === null) return;
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      signatures: ann.signatures.filter((_, i) => i !== editingSignIndex),
    }));
    setSignEditModalVisible(false);
    setEditingSignIndex(null);
    triggerToast('Signature', 'Signature deleted', 'info', 1500);
  };

  const redrawSignature = () => {
    // Delete current and open sign modal for new one
    if (editingSignIndex !== null) {
      const page = getActivePageFromRef();
      if (page) {
        updateAnnotations(page.index, (ann) => ({
          ...ann,
          signatures: ann.signatures.filter((_, i) => i !== editingSignIndex),
        }));
      }
    }
    setSignEditModalVisible(false);
    setEditingSignIndex(null);
    setSignPaths([]);
    signPathsRef.current = [];
    setSignModalVisible(true);
  };

  // Image edit — tap to open size editor, delete
  const editImageAnnotation = (imgIndex) => {
    setActiveTool(null);
    const page = getActivePageFromRef();
    if (!page) return;
    const ann = annotationsRef.current[page.index];
    if (!ann || !ann.images[imgIndex]) return;
    const img = ann.images[imgIndex];
    setEditingImageIndex(imgIndex);
    setEditImageWidth(img.width);
    setEditImageHeight(img.height);
    setImageEditModalVisible(true);
  };

  const confirmImageEdit = () => {
    if (editingImageIndex === null) return;
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      images: ann.images.map((img, i) => i === editingImageIndex
        ? { ...img, width: editImageWidth, height: editImageHeight }
        : img
      ),
    }));
    setImageEditModalVisible(false);
    setEditingImageIndex(null);
  };

  const deleteImageAnnotation = () => {
    if (editingImageIndex === null) return;
    const page = getActivePageFromRef();
    if (!page) return;
    updateAnnotations(page.index, (ann) => ({
      ...ann,
      images: ann.images.filter((_, i) => i !== editingImageIndex),
    }));
    setImageEditModalVisible(false);
    setEditingImageIndex(null);
    triggerToast('Image', 'Image deleted', 'info', 1500);
  };

  // Pick image to place
  const pickImageToPlace = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      triggerToast('Permission', 'Gallery access needed', 'alert', 2000);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;

    const page = getActivePageFromRef();
    if (!page) return;
    const imgUri = result.assets[0].uri;

    // Place image in center of page
    const ann = annotations[page.index] || { paths: [], texts: [], highlights: [], images: [], signatures: [] };
    const newIndex = ann.images.length;
    updateAnnotations(page.index, (a) => ({
      ...a,
      images: [...a.images, {
        uri: imgUri,
        x: PAGE_WIDTH / 2 - 50,
        y: (PAGE_WIDTH / 0.707) / 2 - 50,
        width: 100,
        height: 100,
      }],
    }));
    setPlacingImage(null);
    setActiveTool(null);
    setPositioningItem({ type: 'image', index: newIndex });
    triggerToast('Image', 'Use arrows to position', 'info', 2000);
  };

  // Signature drawing PanResponder
  const signPointsRef = useRef([]);
  const signPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      signPointsRef.current = [{ x: locationX, y: locationY }];
      signPath.current = `M${locationX},${locationY}`;
      setActiveSignPath(`M${locationX},${locationY}`);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      signPointsRef.current.push({ x: locationX, y: locationY });
      signPath.current = buildSmoothPath(signPointsRef.current);
      setActiveSignPath(signPath.current);
    },
    onPanResponderRelease: () => {
      if (signPath.current && signPath.current.length > 5) {
        const completedPath = signPath.current;
        setSignPaths(prev => {
          const updated = [...prev, { d: completedPath }];
          signPathsRef.current = updated;
          return updated;
        });
      }
      signPath.current = '';
      signPointsRef.current = [];
      setActiveSignPath('');
    },
  }), []);

  const confirmSignature = () => {
    const validPaths = signPathsRef.current.filter(p => p.d && p.d.length > 5);
    if (validPaths.length === 0) {
      setSignModalVisible(false);
      return;
    }
    const page = getActivePageFromRef();
    if (!page) return;

    // Place signature in center of page
    const ann = annotations[page.index] || { paths: [], texts: [], highlights: [], images: [], signatures: [] };
    const newIndex = ann.signatures.length;
    updateAnnotations(page.index, (a) => ({
      ...a,
      signatures: [...a.signatures, {
        paths: validPaths,
        x: PAGE_WIDTH / 2 - 75,
        y: (PAGE_WIDTH / 0.707) / 2 - 37,
      }],
    }));

    setSignModalVisible(false);
    setSignPaths([]);
    signPathsRef.current = [];
    setActiveSignPath('');
    setPlacingSignature(false);
    setSignatureData(null);
    setActiveTool(null);
    setPositioningItem({ type: 'signature', index: newIndex });
    triggerToast('Signature', 'Use arrows to position', 'info', 2000);
  };

  // Rotate current page
  const rotatePage = () => {
    const activePage = getActivePage();
    if (!activePage) return;
    setPages(prev => prev.map(p =>
      p.index === activePage.index ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    ));
    triggerToast('Rotated', 'Page rotated 90°', 'info', 1500);
  };

  // Delete current page — called from confirmation modal
  const confirmDeletePage = () => {
    const activePage = getActivePage();
    if (!activePage) return;
    const isLastPage = currentPage >= getActivePageCount() - 1;

    setPages(prev => prev.map(p =>
      p.index === activePage.index ? { ...p, deleted: true } : p
    ));
    setDeleteModalVisible(false);

    if (isLastPage) {
      goToPage(Math.max(0, currentPage - 1));
    } else {
      // Stay on same index — next page shifts into current position
      loadPageImage(pages.filter(p => !p.deleted && p.index !== activePage.index)[currentPage]?.index);
    }
    triggerToast('Deleted', `Page ${currentPage + 1} removed`, 'info', 1500);
  };

  // Undo last annotation on current page
  const undoLast = () => {
    const page = getActivePage();
    if (!page) return;
    updateAnnotations(page.index, (ann) => {
      // Remove the most recently added annotation across all types
      const types = ['paths', 'highlights', 'texts', 'images', 'signatures'];
      for (const type of types.reverse()) {
        // Actually, just remove last from any non-empty type
      }
      // Simple: remove last path first, then highlight, then text, etc.
      if (ann.signatures.length > 0) return { ...ann, signatures: ann.signatures.slice(0, -1) };
      if (ann.images.length > 0) return { ...ann, images: ann.images.slice(0, -1) };
      if (ann.texts.length > 0) return { ...ann, texts: ann.texts.slice(0, -1) };
      if (ann.highlights.length > 0) return { ...ann, highlights: ann.highlights.slice(0, -1) };
      if (ann.paths.length > 0) return { ...ann, paths: ann.paths.slice(0, -1) };
      return ann;
    });
  };

  // Save annotated PDF
  const saveAnnotatedPdf = async () => {
    setSaving(true);
    try {
      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const capturedPaths = [];
      const activePages = pages.filter(p => !p.deleted);

      for (let i = 0; i < activePages.length; i++) {
        setCurrentPage(i);
        await loadPageImage(activePages[i].index);
        await new Promise(r => setTimeout(r, 300));

        const uri = await captureRef(pageRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          pixelRatio: 16,
        });
        capturedPaths.push(uri.replace('file://', ''));
      }

      const outputPath = `${cacheDir}/ToolsApp_PDFEditor_${Date.now()}.pdf`;
      const res = await createPdfFromImages(capturedPaths, outputPath);

      setResult(res);
      setUndoStack([]);
      setRedoStack([]);
      triggerToast('Success', `PDF saved with ${res.pageCount} pages`, 'success', 2500);
    } catch (e) {
      triggerToast('Error', 'Failed to save PDF: ' + e.message, 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  // Save to downloads
  const handleSaveToDownloads = async () => {
    if (!result) return;
    setSaving(true);
    try {
      if (Platform.OS === 'android' && Platform.Version < 29) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      }
      const baseName = pdfName.replace(/\.pdf$/i, '');
      const fileName = `${baseName}_edited_${Date.now()}.pdf`;
      await saveToDownloads(result.path, fileName, 'application/pdf');
      triggerToast('Saved', 'PDF saved to Downloads', 'success', 2000);
    } catch (e) {
      triggerToast('Error', e.message, 'error', 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({ url: 'file://' + result.path, title: 'Share PDF' });
    } catch (_) { }
  };

  // Current page data
  const activePage = getActivePage();
  const activePageIdx = activePage ? activePage.index : 0;
  const pageAnn = getAnnotations(activePageIdx);
  const pageImage = pageImages[activePageIdx];
  const pageRotation = activePage ? activePage.rotation : 0;

  // Tool selection
  const selectTool = (toolKey) => {
    // Always clear current tool first to prevent ghost drawing/highlighting
    setActiveTool(null);
    setShowOptions(false);

    if (toolKey === 'image') {
      pickImageToPlace();
      return;
    }
    if (toolKey === 'signature') {
      setSignPaths([]);
      setSignModalVisible(true);
      return;
    }
    if (toolKey === 'text') {
      setTextInput('');
      setTextBold(false);
      setTextSize(16);
      setTextColor('#000000');
      setEditingTextIndex(null);
      setTextModalVisible(true);
      return;
    }
    if (toolKey === 'rotate') {
      rotatePage();
      return;
    }
    if (toolKey === 'delete') {
      if (getActivePageCount() <= 1) {
        triggerToast('Cannot Delete', 'PDF must have at least one page', 'alert', 2000);
        return;
      }
      setDeleteModalVisible(true);
      return;
    }
    if (toolKey === 'rename') {
      setRenameInput(pdfName.replace(/\.pdf$/i, ''));
      setRenameModalVisible(true);
      return;
    }
    setActiveTool(activeTool === toolKey ? null : toolKey);
    setShowOptions(activeTool !== toolKey);
    setPlacingSignature(false);
    setPlacingImage(null);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading} numberOfLines={1}>
          {pdfUri ? pdfName : 'PDF Editor'}
        </Text>
      </View>

      {!pdfUri ? (
        <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>PDF Editor</Text>
            <Text style={styles.emptyDesc}>
              Draw, add text, highlight, sign, insert images, rotate or delete pages
            </Text>
          </View>

          <TouchableOpacity style={styles.pickBtn} onPress={handlePickPdf} activeOpacity={0.8}>
            <MaterialIcons name="picture-as-pdf" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>Pick PDF to Edit</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Loading PDF...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Page navigation */}
          {pdfUri && !result && (
            <View style={styles.pageNavBar}>
              <TouchableOpacity
                onPress={() => goToPage(currentPage - 1)}
                disabled={currentPage === 0}
                style={[styles.pageNavSolidBtn, currentPage === 0 && { opacity: 0.3 }]}
              >
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.pageIndicator}>
                Page {currentPage + 1} of {getActivePageCount()}
              </Text>
              <TouchableOpacity
                onPress={() => goToPage(currentPage + 1)}
                disabled={currentPage >= getActivePageCount() - 1}
                style={[styles.pageNavSolidBtn, currentPage >= getActivePageCount() - 1 && { opacity: 0.3 }]}
              >
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                onPress={handleUndo}
                disabled={undoStack.length === 0}
                style={[styles.undoRedoBtn, undoStack.length === 0 && { opacity: 0.3 }]}
              >
                <Octicons name="undo" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRedo}
                disabled={redoStack.length === 0}
                style={[styles.undoRedoBtn, redoStack.length === 0 && { opacity: 0.3 }]}
              >
                <Octicons name="redo" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Canvas area */}
          {!result && <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.canvasContainer}
            showsVerticalScrollIndicator={false}
          >
            <View
              ref={pageRef}
              style={[styles.pageView, { transform: [{ rotate: `${pageRotation}deg` }] }]}
              collapsable={false}
            >
              {/* Page image */}
              {pageImage && (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${pageImage}` }}
                  style={styles.pageImage}
                  resizeMode="contain"
                />
              )}

              {/* Annotations SVG overlay */}
              <View
                style={StyleSheet.absoluteFill}
                {...drawPanResponder.panHandlers}
              >
                <Svg style={StyleSheet.absoluteFill}>
                  {/* Highlights */}
                  {pageAnn.highlights.map((h, i) => (
                    <Path key={`h-${i}`} d={h.d} stroke={h.color} strokeWidth={h.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {/* Drawn paths */}
                  {pageAnn.paths.map((p, i) => (
                    <Path key={`p-${i}`} d={p.d} stroke={p.color} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {/* Current drawing path */}
                  {drawingPaths.map((p, i) => (
                    <Path
                      key={`dp-${i}`}
                      d={p.d}
                      stroke={activeTool === 'highlight' ? highlightColor : drawColor}
                      strokeWidth={activeTool === 'highlight' ? 20 : strokeSize}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>

                {/* Text annotations — draggable + pinch to zoom + tap to edit */}
                {pageAnn.texts.map((t, i) => (
                  <DraggableText key={`t-${i}`} item={t} index={i} onUpdate={updateTextAnnotation} onEdit={editTextAnnotation} isPositioning={positioningItem?.type === 'text' && positioningItem?.index === i} />
                ))}

                {/* Image annotations — draggable */}
                {pageAnn.images.map((img, i) => (
                  <DraggableImage key={`img-${i}`} item={img} index={i} onUpdate={updateImageAnnotation} onEdit={editImageAnnotation} isPositioning={positioningItem?.type === 'image' && positioningItem?.index === i} />
                ))}

                {/* Signature annotations — draggable */}
                {pageAnn.signatures.map((sig, i) => (
                  <DraggableSignature key={`sig-${i}`} item={sig} index={i} onUpdate={updateSignatureAnnotation} onEdit={editSignAnnotation} isPositioning={positioningItem?.type === 'signature' && positioningItem?.index === i} />
                ))}
              </View>

            </View>
          </ScrollView>}

          {/* Tool options (color/size pickers) */}
          {showOptions && activeTool === 'draw' && (
            <View style={styles.optionsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionsRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, drawColor === c && styles.colorDotActive]}
                    onPress={() => setDrawColor(c)}
                  />
                ))}
                <View style={styles.optionsDivider} />
                {STROKE_SIZES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sizeDot, strokeSize === s && styles.sizeDotActive]}
                    onPress={() => setStrokeSize(s)}
                  >
                    <View style={{ width: s * 2.5, height: s * 2.5, borderRadius: s * 1.25, backgroundColor: drawColor }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {showOptions && activeTool === 'highlight' && (
            <View style={styles.optionsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionsRow}>
                {HIGHLIGHT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, highlightColor === c && styles.colorDotActive]}
                    onPress={() => setHighlightColor(c)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Toolbar — dynamic: positioning controls or normal tools */}
          {!result && (
            <View style={styles.toolbar}>
              {positioningItem !== null ? (
                /* Text positioning controls */
                <View style={styles.positioningBar}>
                  <View style={styles.arrowsContainer}>
                    <View style={styles.arrowRow}>
                      <View style={{ width: 44 }} />
                      <TouchableOpacity style={styles.arrowBtn} onPress={() => moveItem('up')} activeOpacity={0.6}>
                        <Ionicons name="arrow-up" size={20} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <View style={{ width: 44 }} />
                    </View>
                    <View style={styles.arrowRow}>
                      <TouchableOpacity style={styles.arrowBtn} onPress={() => moveItem('left')} activeOpacity={0.6}>
                        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <View style={[styles.arrowBtn, { backgroundColor: ACCENT + '20' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT }}>{moveStep}px</Text>
                      </View>
                      <TouchableOpacity style={styles.arrowBtn} onPress={() => moveItem('right')} activeOpacity={0.6}>
                        <Ionicons name="arrow-forward" size={20} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.arrowRow}>
                      <View style={{ width: 44 }} />
                      <TouchableOpacity style={styles.arrowBtn} onPress={() => moveItem('down')} activeOpacity={0.6}>
                        <Ionicons name="arrow-down" size={20} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <View style={{ width: 44 }} />
                    </View>
                  </View>

                  <View style={styles.stepAndDone}>
                    <Text style={styles.stepLabel}>Step (px)</Text>
                    <View style={styles.stepRow}>
                      <TouchableOpacity style={styles.stepAdjustBtn} onPress={() => setMoveStep(s => Math.max(1, s - 1))} activeOpacity={0.6}>
                        <Ionicons name="remove" size={18} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <View style={styles.stepValueBox}>
                        <Text style={styles.stepValueText}>{moveStep}</Text>
                      </View>
                      <TouchableOpacity style={styles.stepAdjustBtn} onPress={() => setMoveStep(s => Math.min(50, s + 1))} activeOpacity={0.6}>
                        <Ionicons name="add" size={18} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.donePositionBtn}
                      onPress={() => setPositioningItem(null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.donePositionText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Normal tools */
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
                  {TOOLS.map(tool => {
                    const isActive = activeTool === tool.key;
                    const IconLib = tool.lib === 'MaterialCommunityIcons' ? MaterialCommunityIcons : MaterialIcons;
                    return (
                      <TouchableOpacity
                        key={tool.key}
                        style={[styles.toolBtn, isActive && styles.toolBtnActive]}
                        onPress={() => selectTool(tool.key)}
                        activeOpacity={0.7}
                      >
                        <IconLib name={tool.icon} size={20} color={isActive ? '#fff' : colors.textPrimary} />
                        <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>{tool.label}</Text>
                      </TouchableOpacity>
                    );
                  })}

                  <View style={styles.optionsDivider} />

                  {/* Save button */}
                  <TouchableOpacity
                    style={[styles.toolBtn, styles.saveBtnTool]}
                    onPress={saveAnnotatedPdf}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="save" size={20} color="#fff" />
                    )}
                    <Text style={[styles.toolLabel, { color: '#fff' }]}>Save</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          )}

          {/* Result section */}
          {result && (
            <View style={styles.resultSection}>
              <View style={styles.resultPdfIcon}>
                <View style={styles.resultPdfIconCircle}>
                  <MaterialIcons name="picture-as-pdf" size={56} color={ACCENT} />
                </View>
                <Text style={styles.resultPdfName} numberOfLines={1}>{pdfName}</Text>
                <Text style={styles.resultPdfInfo}>{result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'}</Text>
              </View>
              <View style={styles.resultBtnRow}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveToDownloads} disabled={saving} activeOpacity={0.8}>
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                  <Ionicons name="share" size={20} color={colors.shareBtnText} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.editAgainBtn}
                onPress={() => { setResult(null); }}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={24} color={isDark ? ACCENT : '#fff'} />
                <Text style={styles.editAgainText}>Continue Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.newPdfBtn}
                onPress={() => {
                  setPdfUri(null);
                  setAnnotations({});
                  setResult(null);
                  setPageImages({});
                  setPages([]);
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="note-add" size={18} color={colors.textPrimary} />
                <Text style={styles.newPdfText}>Edit New PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Text Input Modal */}
      <Modal visible={textModalVisible} transparent animationType="fade" onRequestClose={() => { setTextModalVisible(false); setEditingTextIndex(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{editingTextIndex !== null ? 'Edit Text' : 'Add Text'}</Text>

              {/* Live Preview */}
              <View style={styles.textPreviewBox}>
                <Text style={{
                  color: textInput ? textColor : colors.textTertiary,
                  fontSize: Math.min(textSize, 28),
                  fontWeight: textBold ? '900' : '400',
                  textAlign: 'center',
                }} numberOfLines={2}>
                  {textInput || 'Preview'}
                </Text>
              </View>

              <TextInput
                style={styles.modalInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Enter text..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
                multiline
              />

              {/* Font Size Slider */}
              <View style={styles.textOptionRow}>
                <Text style={styles.textOptionLabel}>Size: {textSize}</Text>
                <View style={styles.textSizeSliderRow}>
                  <TouchableOpacity onPress={() => setTextSize(s => Math.max(5, s - 1))} style={styles.sizeAdjustBtn}>
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.textSizeTrack}>
                    {[5, 10, 16, 24, 36].map(s => (
                      <TouchableOpacity key={s} onPress={() => setTextSize(s)} style={[styles.sizeQuickBtn, textSize === s && styles.sizeQuickBtnActive]}>
                        <Text style={[styles.sizeQuickLabel, textSize === s && { color: '#fff' }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity onPress={() => setTextSize(s => Math.min(36, s + 1))} style={styles.sizeAdjustBtn}>
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bold Toggle */}
              <TouchableOpacity style={[styles.boldToggle, textBold && styles.boldToggleActive]} onPress={() => setTextBold(b => !b)} activeOpacity={0.7}>
                <Text style={[styles.boldToggleText, textBold && { color: '#fff' }]}>B</Text>
                <Text style={[styles.boldToggleLabel, textBold && { color: '#fff' }]}>{textBold ? 'Bold' : 'Normal'}</Text>
              </TouchableOpacity>

              {/* Color Picker */}
              <View style={styles.modalColorRow}>
                {COLORS.filter(c => c !== '#FFFFFF').map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotActive]}
                    onPress={() => setTextColor(c)}
                  />
                ))}
              </View>

              {/* Action Buttons */}
              <View style={styles.modalBtnRow}>
                {editingTextIndex !== null && (
                  <TouchableOpacity style={styles.textDeleteBtn} onPress={deleteTextAnnotation}>
                    <Ionicons name="trash-outline" size={18} color="#F44336" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setTextModalVisible(false); setEditingTextIndex(null); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, !textInput.trim() && { opacity: 0.4 }]}
                  onPress={confirmText}
                  disabled={!textInput.trim()}
                >
                  <Text style={styles.modalConfirmText}>{editingTextIndex !== null ? 'Update' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Signature Modal */}
      <Modal visible={signModalVisible} transparent animationType="slide" onRequestClose={() => setSignModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.signModalBox}>
            <Text style={styles.modalTitle}>Draw Your Signature</Text>
            <View style={styles.signCanvas} {...signPanResponder.panHandlers}>
              <Svg style={StyleSheet.absoluteFill}>
                {signPaths.map((sp, i) => (
                  sp.d ? <Path key={i} d={sp.d} stroke="#000" strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null
                ))}
                {activeSignPath ? <Path d={activeSignPath} stroke="#000" strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null}
              </Svg>
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setSignModalVisible(false); setSignPaths([]); signPathsRef.current = []; setActiveSignPath(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setSignPaths([]); signPathsRef.current = []; setActiveSignPath(''); }}>
                <Text style={styles.modalCancelText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmSignature}>
                <Text style={styles.modalConfirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Signature Edit Modal */}
      <Modal visible={signEditModalVisible} transparent animationType="fade" onRequestClose={() => setSignEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Signature</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              You can reposition the signature by dragging it on the page, or use the options below.
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.textDeleteBtn} onPress={deleteSignAnnotation}>
                <Ionicons name="trash-outline" size={18} color="#F44336" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: isDark ? '#222' : '#e8e8e8' }]} onPress={redrawSignature}>
                <Text style={[styles.modalCancelText, { color: ACCENT }]}>Redraw</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSignEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Edit Modal */}
      <Modal visible={imageEditModalVisible} transparent animationType="fade" onRequestClose={() => setImageEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Image</Text>

            {/* Width */}
            <View style={styles.textOptionRow}>
              <Text style={styles.textOptionLabel}>Width: {editImageWidth}px</Text>
              <View style={styles.textSizeSliderRow}>
                <TouchableOpacity onPress={() => setEditImageWidth(w => Math.max(20, w - 10))} style={styles.sizeAdjustBtn}>
                  <Ionicons name="remove" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.textSizeTrack}>
                  {[50, 80, 120, 180, 250].map(s => (
                    <TouchableOpacity key={s} onPress={() => setEditImageWidth(s)} style={[styles.sizeQuickBtn, editImageWidth === s && styles.sizeQuickBtnActive]}>
                      <Text style={[styles.sizeQuickLabel, editImageWidth === s && { color: '#fff' }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setEditImageWidth(w => Math.min(PAGE_WIDTH, w + 10))} style={styles.sizeAdjustBtn}>
                  <Ionicons name="add" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Height */}
            <View style={styles.textOptionRow}>
              <Text style={styles.textOptionLabel}>Height: {editImageHeight}px</Text>
              <View style={styles.textSizeSliderRow}>
                <TouchableOpacity onPress={() => setEditImageHeight(h => Math.max(20, h - 10))} style={styles.sizeAdjustBtn}>
                  <Ionicons name="remove" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.textSizeTrack}>
                  {[50, 80, 120, 180, 250].map(s => (
                    <TouchableOpacity key={s} onPress={() => setEditImageHeight(s)} style={[styles.sizeQuickBtn, editImageHeight === s && styles.sizeQuickBtnActive]}>
                      <Text style={[styles.sizeQuickLabel, editImageHeight === s && { color: '#fff' }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setEditImageHeight(h => Math.min(800, h + 10))} style={styles.sizeAdjustBtn}>
                  <Ionicons name="add" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.textDeleteBtn} onPress={deleteImageAnnotation}>
                <Ionicons name="trash-outline" size={18} color="#F44336" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setImageEditModalVisible(false); setEditingImageIndex(null); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmImageEdit}>
                <Text style={styles.modalConfirmText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Rename PDF</Text>
              <TextInput
                style={styles.modalInput}
                value={renameInput}
                onChangeText={setRenameInput}
                placeholder="Enter file name..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRenameModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity> 
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, !renameInput.trim() && { opacity: 0.4 }]}
                  disabled={!renameInput.trim()}
                  onPress={() => {
                    setPdfName(renameInput.trim() + '.pdf');
                    setRenameModalVisible(false);
                    triggerToast('Renamed', 'File renamed to ' + renameInput.trim() + '.pdf', 'info', 2000);
                  }}
                >
                  <Text style={styles.modalConfirmText}>Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Page Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.deleteModalIconRow}>
              <View style={styles.deleteModalIconCircle}>
                <MaterialIcons name="delete-outline" size={32} color="#F44336" />
              </View>
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Delete Page {currentPage + 1}?</Text>
            <Text style={styles.deleteModalDesc}>
              This will permanently remove page {currentPage + 1} from the PDF. This action cannot be undone.
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmBtn} onPress={confirmDeletePage}>
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Warning Modal */}
      <Modal
        visible={warningModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWarningModalVisible(false)}
      >
        <View style={styles.warningModalOverlay}>
          <BlurView
            blurType={colors.blurType}
            blurAmount={10}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.warningModalBox}>
            <View style={styles.warningTitleContainer}>
              <Ionicons name="warning" size={32} color={ACCENT} />
              <Text style={styles.warningTitle}>PDF Warning</Text>
            </View>

            <Text style={styles.warningMessage}>
              This editor works best with text-based PDFs. PDFs containing images, scanned documents, or complex layouts may appear faded or degraded in the output. Annotations like drawings, text, and signatures will still render correctly.
            </Text>

            <View style={styles.warningTipsContainer}>
              <Ionicons name="bulb" size={18} color={ACCENT} />
              <Text style={styles.warningTips}>
                For best results, use this editor with PDFs that are primarily text-based. Image-heavy or scanned PDFs may lose quality during export.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => handleDontShowWarning(!dontShowWarning)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, dontShowWarning && styles.checkboxChecked]}>
                {dontShowWarning && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Don't show again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.warningContinueBtn}
              onPress={() => {
                setWarningModalVisible(false);
                pickPdf();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.warningContinueBtnText}>Got it</Text>
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
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    },
    backBtn: { padding: 8, marginRight: 8 },
    heading: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      flex: 1,
    },
    headerAction: { padding: 8 },

    // Empty state
    emptyContainer: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 40 },
    emptyState: { alignItems: 'center', marginBottom: 30 },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 12 },
    emptyDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },

    pickBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: ACCENT, paddingVertical: 14, paddingHorizontal: 28,
      borderRadius: 60, gap: 10, width: '100%',
    },
    pickBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontSize: 16, color: colors.textSecondary, marginTop: 12, fontWeight: '600' },

    // Page actions bar
    pageNavBar: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 6, paddingHorizontal: 16, gap: 14,
    },
    pageNavSolidBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: ACCENT,
      alignItems: 'center', justifyContent: 'center',
    },
    pageIndicator: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    undoRedoBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: isDark ? '#222' : '#e8e8e8',
      alignItems: 'center', justifyContent: 'center',
      marginLeft: 6,
    },

    // Canvas
    canvasContainer: { alignItems: 'center', paddingVertical: 10, paddingBottom: 20 },
    pageView: {
      width: PAGE_WIDTH,
      aspectRatio: 0.707, // A4-ish ratio
      backgroundColor: '#fff',
      borderRadius: 4,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    pageImage: { width: '100%', height: '100%' },

    placingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: ACCENT + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placingText: { color: ACCENT, fontSize: 14, fontWeight: '700', textAlign: 'center' },

    // Options bar
    optionsBar: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
      marginHorizontal: 20,
      borderRadius: 14,
      marginBottom: 4,
    },
    optionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    colorDot: {
      width: 28, height: 28, borderRadius: 14,
      borderWidth: 2, borderColor: 'transparent',
    },
    colorDotActive: { borderColor: ACCENT, borderWidth: 3 },
    sizeDot: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? '#333' : '#e0e0e0',
    },
    sizeDotActive: { borderWidth: 2, borderColor: ACCENT },
    optionsDivider: { width: 1, height: 24, backgroundColor: colors.textTertiary, opacity: 0.3, marginHorizontal: 4 },

    // Toolbar
    toolbar: {
      paddingVertical: 8,
      paddingHorizontal: 8,
      backgroundColor: isDark ? '#111' : '#fafafa',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#222' : '#e0e0e0',
      marginBottom:50
    },
    toolbarContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },

    // Text positioning controls
    positioningBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    arrowsContainer: { alignItems: 'center', gap: 2 },
    arrowRow: { flexDirection: 'row', gap: 2 },
    arrowBtn: {
      width: 54, height: 36, borderRadius: 10,
      backgroundColor: isDark ? '#222' : '#e8e8e8',
      alignItems: 'center', justifyContent: 'center',
    },
    stepAndDone: { alignItems: 'center', gap: 8 },
    stepLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepAdjustBtn: {
      width: 52, height: 32, borderRadius: 16,
      backgroundColor: isDark ? '#222' : '#e0e0e0',
      alignItems: 'center', justifyContent: 'center',
    },
    stepValueBox: {
      minWidth: 36, paddingVertical: 4, paddingHorizontal: 8,
      borderRadius: 8, backgroundColor: isDark ? '#222' : '#e0e0e0',
      alignItems: 'center', justifyContent: 'center',
    },
    stepValueText: { fontSize: 14, fontWeight: '800', color: ACCENT },
    donePositionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: ACCENT, paddingVertical: 8, paddingHorizontal: 18,
      borderRadius: 60,
    },
    donePositionText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    toolBtn: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 13, width: 100,
      borderRadius: 12,
      backgroundColor: isDark ? '#222' : '#ebebeb',
    },
    toolBtnActive: { backgroundColor: ACCENT },
    toolLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
    toolLabelActive: { color: '#fff' },
    saveBtnTool: { backgroundColor: '#4CAF50' },

    // Result
    resultSection: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10, flex: 1 },
    resultPdfIcon: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 40,
    },
    resultPdfIconCircle: {
      width: 110, height: 110, borderRadius: 55,
      backgroundColor: ACCENT + '15',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    resultPdfName: {
      fontSize: 16, fontWeight: '700', color: colors.textPrimary,
      marginBottom: 4, paddingHorizontal: 20, textAlign: 'center',
    },
    resultPdfInfo: {
      fontSize: 13, fontWeight: '500', color: colors.textSecondary,
    },
    resultBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
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
    editAgainBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 12, borderRadius: 60, gap: 8, marginBottom: 10,
      backgroundColor: isDark ? '#fff' : ACCENT,
    },
    editAgainText: { fontSize: 15, fontWeight: '700', color: isDark ? ACCENT : '#fff' },
    newPdfBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 12, borderRadius: 60,
      backgroundColor: isDark ? '#222' : '#e5e5e5', gap: 8,
    },
    newPdfText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

    // Modals
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center',
    },
    modalBox: {
      width: '85%', backgroundColor: colors.card,
      borderRadius: 20, padding: 24,
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
    modalInput: {
      backgroundColor: isDark ? '#222' : '#f5f5f5',
      borderRadius: 12, padding: 14, fontSize: 16,
      color: colors.textPrimary, minHeight: 50, textAlignVertical: 'top',
      marginBottom: 12,
    },
    modalColorRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },

    // Text editor modal
    textPreviewBox: {
      backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
      borderRadius: 12, padding: 16, marginBottom: 12,
      alignItems: 'center', justifyContent: 'center', minHeight: 50,
    },
    textOptionRow: { marginBottom: 10 },
    textOptionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    textSizeSliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sizeAdjustBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: isDark ? '#333' : '#e0e0e0',
      alignItems: 'center', justifyContent: 'center',
    },
    textSizeTrack: { flexDirection: 'row', flex: 1, justifyContent: 'space-around' },
    sizeQuickBtn: {
      paddingVertical: 5, paddingHorizontal: 10,
      borderRadius: 60, backgroundColor: isDark ? '#333' : '#e0e0e0',
    },
    sizeQuickBtnActive: { backgroundColor: ACCENT },
    sizeQuickLabel: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
    boldToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 8, paddingHorizontal: 16,
      borderRadius: 60, backgroundColor: isDark ? '#333' : '#e0e0e0',
      alignSelf: 'flex-start', marginBottom: 12,
    },
    boldToggleActive: { backgroundColor: ACCENT },
    boldToggleText: { fontSize: 16, fontWeight: '900', color: colors.textPrimary },
    boldToggleLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    textDeleteBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: '#F4434615',
      alignItems: 'center', justifyContent: 'center', marginRight: 'auto',
    },
    modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 60 },
    modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    modalConfirmBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 60, backgroundColor: ACCENT },
    modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Signature modal
    signModalBox: {
      width: '90%', backgroundColor: colors.card,
      borderRadius: 20, padding: 24,
    },
    signCanvas: {
      width: '100%', height: 160, backgroundColor: '#fff',
      borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
      marginBottom: 16, overflow: 'hidden',
    },

    // Delete Confirmation Modal
    deleteModalIconRow: { alignItems: 'center', marginBottom: 12 },
    deleteModalIconCircle: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: '#F4433615',
      alignItems: 'center', justifyContent: 'center',
    },
    deleteModalDesc: {
      fontSize: 14, color: colors.textSecondary,
      textAlign: 'center', lineHeight: 20, marginBottom: 20,
    },
    deleteConfirmBtn: {
      paddingVertical: 10, paddingHorizontal: 24,
      borderRadius: 60, backgroundColor: '#F44336',
    },
    deleteConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Warning Modal
    warningModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    warningModalBox: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32,
    },
    warningTitleContainer: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, marginBottom: 16,
    },
    warningTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    warningMessage: {
      fontSize: 15, color: colors.textPrimary,
      lineHeight: 23, marginBottom: 16, textAlign: 'left',
    },
    warningTipsContainer: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: isDark ? '#2a2a2a' : ACCENT + '12',
      borderRadius: 12, padding: 12, marginBottom: 16, gap: 8,
    },
    warningTips: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    checkboxContainer: {
      flexDirection: 'row', alignItems: 'center',
      gap: 10, marginBottom: 24,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6,
      borderWidth: 2, borderColor: colors.textSecondary,
      alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
    checkboxLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
    warningButtonsContainer: {
      flexDirection: 'row', gap: 12, width: '100%', marginBottom: 50,
    },
    warningLeaveBtn: {
      flex: 1, paddingVertical: 16, borderRadius: 60,
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
      borderWidth: 1, borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
      alignItems: 'center',
    },
    warningLeaveBtnText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    warningContinueBtn: {
      width: '100%', paddingVertical: 16, borderRadius: 60,
      backgroundColor: ACCENT, alignItems: 'center', marginBottom: 50,
    },
    warningContinueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  });

export default PDFEditor;
