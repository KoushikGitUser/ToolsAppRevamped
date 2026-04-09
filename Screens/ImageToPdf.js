import { useState, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  PermissionsAndroid,
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons, FontAwesome5, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Image as CompressorImage } from 'react-native-compressor';
import * as ImageManipulator from 'expo-image-manipulator';
import { triggerToast } from '../Services/toast';
import * as ImagePicker from 'expo-image-picker';
import { CropView } from 'react-native-image-crop-tools';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { lockPdf, imagesToPdfNative } from '../modules/pdf-tools';
import { useTheme } from '../Services/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DragSortGrid from '../Components/DragSortGrid';
import { ColorMatrix, concatColorMatrices, contrast as contrastMatrix, grayscale, sepia } from 'react-native-color-matrix-image-filters';
import { captureRef } from 'react-native-view-shot';
import { BlurView } from '@react-native-community/blur';
import Pdf from 'react-native-pdf';
import Toaster from '../Components/UniversalToaster/Toaster';

const ACCENT = '#ff0000';   
const ACCENT_LIGHT = '#FF5252';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THUMB_SIZE = 200;

// Memoized image grid item — only re-renders when its props actually change
const ImageGridItem = memo(({ img, index, isSorting, pdfUri, loading, isCompressing, styles, onPress, onEdit, onRemove, onExpand }) => {
  return (
    <View style={styles.imageItemContainer}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onPress(index)}
        disabled={loading || isCompressing}
      >
        <View style={styles.thumbWrapper}>
          <Image source={{ uri: img.thumbUri || img.uri }} style={styles.thumb} />

          {!isSorting && !pdfUri && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => onEdit(index)}
              disabled={loading || isCompressing}
            >
              <MaterialIcons name="edit" size={20} color="#000" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}

          {!isSorting && (
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(index)}
              disabled={loading || isCompressing}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          )}

          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>

          {!isSorting && (
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => onExpand(index)}
              disabled={loading || isCompressing}
            >
              <MaterialCommunityIcons name="arrow-expand" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const ImageToPdf = ({ navigation }) => {
  const [images, setImages] = useState([]);
  const [pdfUri, setPdfUri] = useState(null);
  const [pdfSize, setPdfSize] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [editIndex, setEditIndex] = useState(null);
  const [isAddingImages, setIsAddingImages] = useState(false);

  // Edit state
  const [contrast, setContrast] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [editedImage, setEditedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImageUri, setOriginalImageUri] = useState(null); // Store original for reverting
  const [activeFilter, setActiveFilter] = useState(null); // Single active filter name
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [hasChanges, setHasChanges] = useState(false); // Track if changes made in current session
  const [cropped, setCropped] = useState(false); // Tracks if a crop was applied in this edit session
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropSourceIndex, setCropSourceIndex] = useState(null);
  const [cropProcessing, setCropProcessing] = useState(false);
  const [captureImageSize, setCaptureImageSize] = useState({ width: 0, height: 0 }); // Actual image size for capture
  const [showFrames, setShowFrames] = useState(false); // Toggle for PDF frames/margins
  const [pageSize, setPageSize] = useState('A4'); // PDF page size
  const [pageSizeModalVisible, setPageSizeModalVisible] = useState(false); // Page size modal
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false); // PDF viewer modal
  const [viewerNeedsPassword, setViewerNeedsPassword] = useState(false);
  const [viewerPasswordInput, setViewerPasswordInput] = useState('');
  const [viewerPassword, setViewerPassword] = useState('');
  const [viewerPasswordError, setViewerPasswordError] = useState('');
  const [isSorting, setIsSorting] = useState(false); // Sorting session state
  const [selectedImageForSort, setSelectedImageForSort] = useState(null); // Image selected to sort
  const [sortPositionModalVisible, setSortPositionModalVisible] = useState(false); // Position modal
  const [sortInfoModalVisible, setSortInfoModalVisible] = useState(false); // Sort help info modal
  const [applyToAll, setApplyToAll] = useState(false); // Apply edits to all images toggle
  const [editModalToast, setEditModalToast] = useState(null); // Toast for edit modal
  const [isCompressing, setIsCompressing] = useState(false); // Compression progress state
  const [saving, setSaving] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 }); // Compression progress
  const [renameModalVisible, setRenameModalVisible] = useState(false); // Rename modal
  const [pdfName, setPdfName] = useState(''); // PDF name
  const [tempPdfName, setTempPdfName] = useState(''); // Temp name for modal input
  const [compressionQuality, setCompressionQuality] = useState('small'); // Compression quality: high, balanced, small
  const [qualityModalVisible, setQualityModalVisible] = useState(false); // Quality selector modal
  const [warningModalVisible, setWarningModalVisible] = useState(false); // Excessive PDF size warning modal
  const [estimatedOutputBytes, setEstimatedOutputBytes] = useState(0);
  const [pdfPassword, setPdfPassword] = useState(''); // PDF password for locking
  const [tempPdfPassword, setTempPdfPassword] = useState(''); // Temp password for modal
  const [passwordEnabled, setPasswordEnabled] = useState(false); // Password toggle
  const [passwordModalVisible, setPasswordModalVisible] = useState(false); // Password modal
  const [showPasswordInput, setShowPasswordInput] = useState(false); // Show/hide password

  // Ref for capturing the filtered image view
  const imageViewRef = useRef(null);
  const cropViewRef = useRef(null);

  // Animation for apply to all toggle
  const applyToAllAnimation = useRef(new Animated.Value(0)).current;

  // Animation for frame toggle
  const frameToggleAnimation = useRef(new Animated.Value(0)).current;

  // Animation for password toggle
  const passwordToggleAnimation = useRef(new Animated.Value(0)).current;

  // Page size options with dimensions in points (1 inch = 72 points)
  const PAGE_SIZES = {
    'Auto': { width: 612, height: 792, label: 'Auto (Fit to Content)' },
    'A3': { width: 842, height: 1191, label: 'A3 (297 × 420 mm)' },
    'A4': { width: 612, height: 792, label: 'A4 (210 × 297 mm)' },
    'A5': { width: 420, height: 595, label: 'A5 (148 × 210 mm)' },
    'B4': { width: 709, height: 1001, label: 'B4 (250 × 353 mm)' },
    'B5': { width: 499, height: 709, label: 'B5 (176 × 250 mm)' },
    'Letter': { width: 612, height: 792, label: 'Letter (8.5 × 11 in)' },
    'Legal': { width: 612, height: 1008, label: 'Legal (8.5 × 14 in)' },
    'Executive': { width: 522, height: 756, label: 'Executive (7.25 × 10.5 in)' },
    'Business Card': { width: 252, height: 144, label: 'Business Card (3.5 × 2 in)' },
  };

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const pickImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        triggerToast('Permission needed', 'Please grant gallery access to pick images.', 'alert', 3000);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      // Show loader immediately after picker closes
      if (!result.canceled && result.assets?.length > 0) {
        // Set loading state first
        setIsAddingImages(true);

        // Force a render cycle before processing
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          });
        });

        try {
          const MAX_SIZE = 8 * 1024 * 1024;
          const MAX_COUNT = 500;
          const remaining = MAX_COUNT - images.length;

          const oversized = result.assets.filter(a => a.fileSize && a.fileSize > MAX_SIZE);
          const valid = result.assets.filter(a => !a.fileSize || a.fileSize <= MAX_SIZE);
          const toAdd = valid.slice(0, remaining);
          const countExceeded = valid.length - toAdd.length;

          if (toAdd.length > 0) {
            // Convert non-JPEGs to JPEG (so the native PdfBox engine can use JPEG passthrough)
            // and generate thumbnails in a single pass per image.
            const processed = await Promise.all(
              toAdd.map(async (asset) => {
                let jpegUri = asset.uri;
                let jpegSize = asset.fileSize;
                let jpegW = asset.width;
                let jpegH = asset.height;

                const isJpeg =
                  /\.jpe?g$/i.test(asset.uri) || asset.mimeType === 'image/jpeg';
                if (!isJpeg) {
                  try {
                    const converted = await ImageManipulator.manipulateAsync(
                      asset.uri,
                      [],
                      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    jpegUri = converted.uri;
                    jpegW = converted.width;
                    jpegH = converted.height;
                    try {
                      const f = new File(converted.uri);
                      if (f.exists) jpegSize = f.size;
                    } catch {}
                  } catch {
                    // If conversion fails, keep original URI; native engine has a fallback
                  }
                }

                let thumbUri = jpegUri;
                try {
                  const thumb = await ImageManipulator.manipulateAsync(
                    jpegUri,
                    [{ resize: { width: 250 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  thumbUri = thumb.uri;
                } catch {}

                return {
                  ...asset,
                  uri: jpegUri,
                  thumbUri,
                  fileSize: jpegSize,
                  width: jpegW,
                  height: jpegH,
                };
              })
            );
            setImages((prev) => [...prev, ...processed]);
            setPdfUri(null);
          }

          if (oversized.length > 0) {
            triggerToast(
              `${oversized.length} image${oversized.length > 1 ? 's' : ''} skipped`,
              'Each image must be 8 MB or less.',
              'alert',
              3500
            );
          } else if (countExceeded > 0) {
            triggerToast('Limit Reached', `Max 500 images allowed. Only ${toAdd.length} added.`, 'alert', 3000);
          }

          setIsAddingImages(false);
        } catch (error) {
          console.log('Error processing images:', error);
          setIsAddingImages(false);
        }
      }
    } catch (error) {
      console.log('Error picking images:', error);
      setIsAddingImages(false);
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPdfUri(null);
  };

  const clearAll = () => {
    setImages([]);
    setPdfUri(null);
  };

  const startSorting = () => {
    setIsSorting(true);
  };

  const doneSorting = () => {
    setIsSorting(false);
    setSelectedImageForSort(null);
    triggerToast('Sorted', 'Image order updated', 'success', 2000);
  };

  const handleDragReorder = (reorderedImages) => {
    setImages(reorderedImages);
    setPdfUri(null);
  };

  const selectImageToSort = (index) => {
    setSelectedImageForSort(index);
    setSortPositionModalVisible(true);
  };

  const moveImageToPosition = (newPosition) => {
    if (selectedImageForSort === null) return;

    const newImages = [...images];
    const [movedImage] = newImages.splice(selectedImageForSort, 1);
    newImages.splice(newPosition, 0, movedImage);

    setImages(newImages);
    setPdfUri(null);
    setSortPositionModalVisible(false);
    setSelectedImageForSort(null);
    triggerToast('Sorted', `Image moved to position ${newPosition + 1}`, 'success', 2000);
  };

  const openEditModal = (index) => {
    setEditIndex(index);
    setContrast(1);
    setRotation(0);
    setEditedImage(null);
    setActiveFilter(null);
    setHasChanges(false);
    setCropped(false);
    setApplyToAll(false);

    // Reset apply to all toggle animation
    applyToAllAnimation.setValue(0);

    // Store original image URI for reverting
    const imageUri = images[index]?.uri;
    setOriginalImageUri(imageUri);

    // Get actual image dimensions for capture
    Image.getSize(imageUri, (width, height) => {
      setCaptureImageSize({ width, height });
    });
  };

  const closeEditModal = () => {
    // Discard all unsaved edits - revert to original
    if (originalImageUri && editIndex !== null) {
      const updatedImages = [...images];
      updatedImages[editIndex] = { ...updatedImages[editIndex], uri: originalImageUri };
      setImages(updatedImages);
    }

    setEditIndex(null);
    setContrast(1);
    setRotation(0);
    setEditedImage(null);
    setOriginalImageUri(null);
    setActiveFilter(null);
    setHasChanges(false);
    setCropped(false);
  };

  const revertToOriginal = () => {
    if (originalImageUri && editIndex !== null) {
      // Reset all edits
      setContrast(1);
      setRotation(0);
      setActiveFilter(null);
      setHasChanges(false);

      // Restore original image
      const updatedImages = [...images];
      updatedImages[editIndex] = { ...updatedImages[editIndex], uri: originalImageUri };
      setImages(updatedImages);

      triggerToast('Reverted', 'All changes discarded', 'info', 2000);
    }
  };

  const saveEdits = async () => {
    console.log('[saveEdits] called', { editIndex, rotation, contrast, activeFilter, applyToAll });
    if (editIndex === null) return;

    // Check if there are any changes to apply
    if (rotation === 0 && contrast === 1 && !activeFilter) {
      // No pending edits — but a crop may have already been applied directly
      if (cropped) {
        triggerToast('Saved', 'Crop applied successfully', 'success', 2000);
      } else {
        triggerToast('Saved', 'No changes were made', 'info', 2000);
      }
      // Update original to current so it doesn't revert
      setOriginalImageUri(images[editIndex].uri);
      setEditIndex(null);
      setContrast(1);
      setRotation(0);
      setEditedImage(null);
      setOriginalImageUri(null);
      setActiveFilter(null);
      setHasChanges(false);
      setCropped(false);
      setApplyToAll(false);
      // Reset apply to all toggle animation
      applyToAllAnimation.setValue(0);
      return;
    }

    setIsProcessing(true);

    try {
      const updatedImages = [...images];

      if (applyToAll) {
        // Apply contrast and filters to current image only
        let currentImageResult = images[editIndex].uri;

        if (contrast !== 1 || activeFilter) {
          if (imageViewRef.current) {
            const capturedUri = await captureRef(imageViewRef, {
              format: 'jpg',
              quality: 0.9,
              result: 'tmpfile',
            });
            currentImageResult = capturedUri;
          }
        }

        // Apply rotation to current image
        if (rotation !== 0) {
          try {
            const manipulated = await ImageManipulator.manipulateAsync(
              currentImageResult,
              [{ rotate: rotation }],
              { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            currentImageResult = manipulated.uri;
          } catch (rotErr) {
            console.log('[saveEdits] rotation failed (current)', rotErr);
            triggerToast('Error', 'Could not rotate this image. It may be in an unsupported format.', 'error', 3500);
            setIsProcessing(false);
            return;
          }
        }

        // Update current image — regenerate thumbnail (non-fatal)
        let curThumbUri = currentImageResult;
        try {
          const newThumb = await ImageManipulator.manipulateAsync(
            currentImageResult,
            [{ resize: { width: 250 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          curThumbUri = newThumb.uri;
        } catch (thumbErr) {
          console.log('[saveEdits] thumbnail regen failed (current), using full-res', thumbErr);
        }
        // Re-stat current image for accurate size estimate
        let curFileSize;
        try {
          const f = new File(currentImageResult.replace(/^file:\/\//, ''));
          if (f.exists) curFileSize = f.size;
        } catch {}
        updatedImages[editIndex] = {
          ...updatedImages[editIndex],
          uri: currentImageResult,
          thumbUri: curThumbUri,
          fileSize: curFileSize ?? updatedImages[editIndex].fileSize,
        };

        // Apply ONLY rotation to all other images
        if (rotation !== 0) {
          for (let i = 0; i < updatedImages.length; i++) {
            if (i !== editIndex) {
              try {
                const manipulated = await ImageManipulator.manipulateAsync(
                  updatedImages[i].uri,
                  [{ rotate: rotation }],
                  { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
                );
                let thumbUri = manipulated.uri;
                try {
                  const thumb = await ImageManipulator.manipulateAsync(
                    manipulated.uri,
                    [{ resize: { width: 250 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  thumbUri = thumb.uri;
                } catch (thumbErr) {
                  console.log('[saveEdits] thumbnail regen failed (apply-all idx ' + i + ')', thumbErr);
                }
                let allFileSize;
                try {
                  const f = new File(manipulated.uri.replace(/^file:\/\//, ''));
                  if (f.exists) allFileSize = f.size;
                } catch {}
                updatedImages[i] = {
                  ...updatedImages[i],
                  uri: manipulated.uri,
                  thumbUri,
                  fileSize: allFileSize ?? updatedImages[i].fileSize,
                };
              } catch (rotErr) {
                console.log('[saveEdits] rotation failed (apply-all idx ' + i + '), skipping', rotErr);
              }
            }
          }
        }

        triggerToast('Success', `Rotation applied to all ${updatedImages.length} images!`, 'success', 2500);
      } else {
        // Apply all edits to current image only
        let result = images[editIndex].uri;

        if (contrast !== 1 || activeFilter) {
          if (imageViewRef.current) {
            const capturedUri = await captureRef(imageViewRef, {
              format: 'jpg',
              quality: 0.9,
              result: 'tmpfile',
            });
            result = capturedUri;
          }
        }

        if (rotation !== 0) {
          console.log('[saveEdits] rotating', { from: result, rotation });
          try {
            const manipulated = await ImageManipulator.manipulateAsync(
              result,
              [{ rotate: rotation }],
              { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            console.log('[saveEdits] rotated to', manipulated.uri);
            result = manipulated.uri;
          } catch (rotErr) {
            console.log('[saveEdits] rotation failed', rotErr);
            triggerToast('Error', 'Could not rotate this image. It may be in an unsupported format.', 'error', 3500);
            setIsProcessing(false);
            return;
          }
        }

        // Thumbnail regeneration — non-fatal, falls back to full-res URI
        let newThumbUri = result;
        try {
          const newThumb = await ImageManipulator.manipulateAsync(
            result,
            [{ resize: { width: 250 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          console.log('[saveEdits] new thumb', newThumb.uri);
          newThumbUri = newThumb.uri;
        } catch (thumbErr) {
          console.log('[saveEdits] thumbnail regen failed, using full-res', thumbErr);
        }
        // Re-stat the new file for accurate size estimates after edit
        let newFileSize;
        try {
          const f = new File(result.replace(/^file:\/\//, ''));
          if (f.exists) newFileSize = f.size;
        } catch {}
        updatedImages[editIndex] = {
          ...updatedImages[editIndex],
          uri: result,
          thumbUri: newThumbUri,
          fileSize: newFileSize ?? updatedImages[editIndex].fileSize,
        };
        triggerToast('Success', 'Image saved successfully!', 'success', 2000);
      }

      setImages(updatedImages);
      setPdfUri(null);

      // Close modal without reverting (changes saved)
      setEditIndex(null);
      setContrast(1);
      setRotation(0);
      setEditedImage(null);
      setOriginalImageUri(null);
      setActiveFilter(null);
      setHasChanges(false);
      setCropped(false);
      setApplyToAll(false);

      // Reset apply to all toggle animation
      applyToAllAnimation.setValue(0);
    } catch (error) {
      console.log('Edit error:', error);
      triggerToast('Error', 'Failed to save image. Please try again.', 'error', 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Open the in-app crop modal for the given image index
  const openCropperForIndex = (index) => {
    if (index === null || index === undefined || !images[index]) return;
    setCropSourceIndex(index);
    setCropModalVisible(true);
  };

  const closeCropModal = () => {
    setCropModalVisible(false);
    setCropSourceIndex(null);
    setCropProcessing(false);
  };

  const handleCropRotateLeft = () => {
    cropViewRef.current?.rotateImage(false);
  };

  const handleCropRotateRight = () => {
    cropViewRef.current?.rotateImage(true);
  };

  const handleCropSavePress = () => {
    if (!cropViewRef.current) return;
    setCropProcessing(true);
    // Triggers onImageCrop callback below
    cropViewRef.current.saveImage(false, 90);
  };

  const handleCropResult = async (res) => {
    try {
      if (!res?.uri || cropSourceIndex === null) {
        setCropProcessing(false);
        return;
      }
      const newUri = res.uri.startsWith('file://') ? res.uri : `file://${res.uri}`;

      // Regenerate thumbnail (non-fatal)
      let newThumbUri = newUri;
      try {
        const thumb = await ImageManipulator.manipulateAsync(
          newUri,
          [{ resize: { width: 250 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        newThumbUri = thumb.uri;
      } catch (thumbErr) {
        console.log('[handleCropResult] thumb regen failed, using full-res', thumbErr);
      }

      // Re-stat the new file so size estimates stay accurate after edits
      let newFileSize;
      try {
        const f = new File(newUri.replace(/^file:\/\//, ''));
        if (f.exists) newFileSize = f.size;
      } catch {}

      setImages((prev) => {
        const updated = [...prev];
        if (updated[cropSourceIndex]) {
          updated[cropSourceIndex] = {
            ...updated[cropSourceIndex],
            uri: newUri,
            thumbUri: newThumbUri,
            width: res.width,
            height: res.height,
            fileSize: newFileSize ?? updated[cropSourceIndex].fileSize,
          };
        }
        return updated;
      });
      setPdfUri(null);
      triggerToast('Cropped', 'Image cropped successfully', 'success', 2000);
    } catch (err) {
      console.log('[handleCropResult] error', err);
      triggerToast('Error', 'Could not save cropped image.', 'error', 3000);
    } finally {
      closeCropModal();
    }
  };

  const rotateLeft = () => {
    // Check if filter is applied
    if (activeFilter) {
      setEditModalToast('Please save the current filter edit before applying rotation');
      setTimeout(() => setEditModalToast(null), 3000);
      return;
    }
    setRotation((prev) => (prev - 90 + 360) % 360);
    setHasChanges(true);
  };

  const rotateRight = () => {
    // Check if filter is applied
    if (activeFilter) {
      setEditModalToast('Please save the current filter edit before applying rotation');
      setTimeout(() => setEditModalToast(null), 3000);
      return;
    }
    setRotation((prev) => (prev + 90) % 360);
    setHasChanges(true);
  };

  const selectFilter = (filterName) => {
    // Check if rotation is applied
    if (rotation !== 0) {
      setEditModalToast('Please save the current rotation edit before applying filter');
      setTimeout(() => setEditModalToast(null), 3000);
      return;
    }

    // Single selection - toggle off if same filter clicked
    if (activeFilter === filterName) {
      setActiveFilter(null);
    } else {
      setActiveFilter(filterName);
    }
    setHasChanges(true);
  };

  const handleContrastChange = (value) => {
    setContrast(value);
    setHasChanges(true);
  };

  // Build color matrix based on active adjustments
  const getColorMatrix = () => {
    const matrices = [];

    // Add contrast
    if (contrast !== 1) {
      matrices.push(contrastMatrix(contrast));
    }

    // Add active filter (only one at a time)
    if (activeFilter === 'grayscale') {
      matrices.push(grayscale());
    } else if (activeFilter === 'sepia') {
      matrices.push(sepia());
    }

    // Concatenate all matrices, or return identity matrix if none
    if (matrices.length === 0) {
      return [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
      ];
    }

    return concatColorMatrices(...matrices);
  };

  // Wrapper around convertToPdf — for Original quality, checks the estimated
  // output size and shows a warning modal if it exceeds 1.5 GB.
  const handleConvertPress = () => {
    if (images.length === 0) return;
    if (compressionQuality === 'original') {
      const estimated = images.reduce((sum, img) => sum + (img.fileSize || 0), 0)
        + images.length * 500; // ~500 B PDF object overhead per page
      const THRESHOLD = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
      if (estimated > THRESHOLD) {
        setEstimatedOutputBytes(estimated);
        setWarningModalVisible(true);
        return;
      }
    }
    convertToPdf();
  };

  const convertToPdf = async () => {
    if (images.length === 0) return;

    // Show compression modal
    setIsCompressing(true);
    setCompressionProgress({ current: 0, total: images.length });

    try {
      // Build the list of file paths to feed to the native PdfBox engine.
      // For 'original' we pass the JPEG paths straight through.
      // For high/balanced/small we run the existing compressor first.
      const compressedPaths = [];
      const tempFilesToCleanup = [];

      if (compressionQuality === 'original') {
        for (let i = 0; i < images.length; i++) {
          setCompressionProgress({ current: i + 1, total: images.length });
          const cleanPath = images[i].uri.replace(/^file:\/\//, '');
          compressedPaths.push(cleanPath);
        }
      } else {
        for (let i = 0; i < images.length; i++) {
          try {
            setCompressionProgress({ current: i + 1, total: images.length });

            let maxWidth, quality;
            if (compressionQuality === 'high') {
              maxWidth = 1200;
              quality = 0.8;
            } else if (compressionQuality === 'balanced') {
              maxWidth = 700;
              quality = 0.5;
            } else { // 'small'
              maxWidth = 500;
              quality = 0.3;
            }

            const compressedUri = await CompressorImage.compress(
              images[i].uri,
              {
                compressionMethod: 'manual',
                maxWidth: maxWidth,
                quality: quality,
                output: 'jpg',
              }
            );

            const cleanPath = compressedUri.replace(/^file:\/\//, '');
            compressedPaths.push(cleanPath);
            tempFilesToCleanup.push(cleanPath);
          } catch (imgError) {
            console.log(`Error compressing image ${i}:`, imgError);
            try {
              const fallbackCompressedUri = await CompressorImage.compress(
                images[i].uri,
                {
                  compressionMethod: 'manual',
                  maxWidth: 400,
                  quality: 0.5,
                  output: 'jpg',
                }
              );
              const cleanPath = fallbackCompressedUri.replace(/^file:\/\//, '');
              compressedPaths.push(cleanPath);
              tempFilesToCleanup.push(cleanPath);
            } catch (fallbackError) {
              console.log(`Fallback compression also failed for image ${i}`);
            }
          }
        }
      }

      // Close compression modal and show converting state
      setIsCompressing(false);
      setLoading(true);

      if (compressedPaths.length === 0) {
        throw new Error('No images to convert to PDF');
      }

      console.log(`Converting ${compressedPaths.length} images to PDF via PdfBox...`);

      const selectedSize = PAGE_SIZES[pageSize];
      const marginPoints = showFrames ? 50 : 0;
      const cacheDir = Paths.cache.uri.replace('file://', '').replace(/\/$/, '');
      const outputPath = `${cacheDir}/imagestopdf_${Date.now()}.pdf`;

      const result = await imagesToPdfNative(
        compressedPaths,
        selectedSize.width,
        selectedSize.height,
        marginPoints,
        outputPath
      );
      const uri = `file://${result.path}`;
      console.log('PDF created successfully at:', uri);

      // Clean up temporary compressed files
      for (const tempPath of tempFilesToCleanup) {
        try {
          const tempFile = new File(tempPath);
          if (tempFile.exists) tempFile.delete();
        } catch {}
      }

      // Rename PDF if custom name is set
      let finalUri = uri;
      if (pdfName && pdfName.trim() !== '') {
        const customFileName = `${pdfName.trim()}.pdf`;
        const customFile = new File(Paths.cache, customFileName);

        // Delete existing file if it exists
        if (customFile.exists) {
          customFile.delete();
        }

        const sourceFile = new File(uri);
        sourceFile.copy(customFile);
        finalUri = customFile.uri;
        console.log('PDF renamed to:', customFile.uri);
      }

      // Lock PDF with password if enabled
      if (passwordEnabled && pdfPassword.trim() !== '') {
        try {
          const inputPath = decodeURIComponent(finalUri.replace(/^file:\/\//, ''));
          const lockedPath = inputPath.replace(/\.pdf$/, '_locked.pdf');
          const result = await lockPdf(inputPath, pdfPassword.trim(), lockedPath);
          finalUri = `file://${result.path}`;
          console.log('PDF locked with password');
        } catch (e) {
          console.log('Error locking PDF:', e);
          triggerToast('Warning', 'PDF created but password protection failed', 'alert', 3000);
        }
      }

      // Get PDF file size
      try {
        const pdfFile = new File(finalUri);
        if (pdfFile.exists) {
          setPdfSize(pdfFile.size);
        }
      } catch (e) {
        console.log('Error getting PDF size:', e);
      }

      setPdfUri(finalUri);
      console.log('PDF conversion completed successfully');
    } catch (error) {
      console.log('PDF conversion error:', error);
      triggerToast('Error', 'Failed to convert images to PDF. Please try again.', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const sharePdf = async () => {
    if (!pdfUri) return;
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
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

  const savePdf = async () => {
    if (!pdfUri) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const fileName = pdfName.trim() ? `${pdfName.trim()}.pdf` : `ToolsApp_PDF_${Date.now()}.pdf`;
      const filePath = pdfUri.replace(/^file:\/\//, '');
      await saveToDownloads(filePath, fileName, 'application/pdf');
      triggerToast('Success', 'Saved to Downloads', 'success', 2500);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const resetToPdfGeneration = () => {
    setPdfUri(null);
    setPdfSize(null);
  };

  const showPdf = () => {
    if (!pdfUri) return;
    setPdfViewerVisible(true);
  };

  // Full-screen sort mode
  if (isSorting) {
    return (
      <GestureHandlerRootView style={styles.container}>
        {/* Sort Header */}
        <View style={styles.sortHeader}>
          <View style={styles.sortHeaderLeft}>
            <Text style={styles.sortHeading}>Sort Images</Text>
            <Text style={styles.sortSubheading}>{images.length} images</Text>
          </View>
          <View style={styles.sortHeaderRight}>
            <TouchableOpacity
              onPress={() => setSortInfoModalVisible(true)}
              style={styles.sortInfoBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={doneSorting}
              style={styles.sortDoneBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.sortDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Drag Sort Grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sortScrollContent}
        >
          <DragSortGrid
            images={images}
            onReorderDone={handleDragReorder}
            borderColor={isDark ? '#555' : '#ccc'}
            badgeColor={accent}
            badgeTextColor="#fff"
          />
        </ScrollView>

        {/* Sort Info Modal */}
        <Modal
          visible={sortInfoModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSortInfoModalVisible(false)}
        >
          <Pressable style={styles.sortInfoModalOverlay} onPress={() => setSortInfoModalVisible(false)}>
            <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sortInfoModalBox}>
              <View style={styles.sortInfoModalHeader}>
                <MaterialIcons name="touch-app" size={28} color={accent} />
                <Text style={styles.sortInfoModalTitle}>How to Sort</Text>
              </View>
              <Text style={styles.sortInfoModalDesc}>
                Long press and hold on any image to pick it up, then drag it to the desired position.{'\n\n'}
                Other images will automatically move out of the way as you drag.{'\n\n'}
                Release the image to drop it in its new position.{'\n\n'}
                Tap <Text style={{ fontWeight: '800', color: accent }}>Done</Text> when you're finished sorting.
              </Text>
              <TouchableOpacity
                onPress={() => setSortInfoModalVisible(false)}
                style={styles.sortInfoModalCloseBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.sortInfoModalCloseBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </GestureHandlerRootView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={loading || isCompressing}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Image to PDF</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        {images.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-image" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No images selected</Text>
            <Text style={styles.emptyDesc}>
              Pick images from your gallery to convert them into a PDF document
            </Text>
          </View>
        )}

        {/* Horizontal Image Scroll */}
        {images.length > 0 && (
          <View style={styles.imageSection}>
            <View style={styles.imageSectionHeader}>
              {isSorting ? (
                <View style={styles.sortingBadge}>
                  <MaterialIcons name="sort" size={16} color="#fff" />
                  <Text style={styles.sortingBadgeText}>Sorting</Text>
                </View>
              ) : (
                <Text style={styles.imageSectionTitle}>{images.length} image{images.length > 1 ? 's' : ''} selected</Text>
              )}
              <View style={styles.headerButtonsContainer}>
                <TouchableOpacity
                  onPress={clearAll}
                  activeOpacity={0.7}
                  style={[styles.clearAllBtn, (isSorting || loading || isCompressing) && styles.buttonDisabled]}
                  disabled={isSorting || loading || isCompressing}
                >
                  <Text style={styles.clearAllText}>Clear All</Text>
                </TouchableOpacity>
                {!isSorting && !pdfUri ? (
                  <TouchableOpacity
                    onPress={startSorting}
                    activeOpacity={0.7}
                    style={[styles.sortBtn, (loading || isCompressing) && styles.buttonDisabled]}
                    disabled={loading || isCompressing}
                  >
                    <Text style={styles.sortBtnText}>Sort</Text>
                  </TouchableOpacity>
                ) : isSorting ? (
                  <TouchableOpacity onPress={doneSorting} activeOpacity={0.7} style={[styles.doneBtn, (loading || isCompressing) && styles.buttonDisabled]} disabled={loading || isCompressing}>
                    <Text style={styles.doneBtnText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <FlatList
              data={images}
              extraData={images}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
              keyExtractor={(item, index) => `${item.uri}-${index}`}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
              windowSize={5}
              removeClippedSubviews={true}
              renderItem={({ item, index }) => (
                <ImageGridItem
                  img={item}
                  index={index}
                  isSorting={isSorting}
                  pdfUri={pdfUri}
                  loading={loading}
                  isCompressing={isCompressing}
                  styles={styles}
                  onPress={(i) => isSorting ? selectImageToSort(i) : setPreviewIndex(i)}
                  onEdit={openCropperForIndex}
                  onRemove={removeImage}
                  onExpand={setPreviewIndex}
                />
              )}
            />
          </View>
        )}

        {/* Sorting Instructions */}
        {isSorting && (
          <View style={styles.sortingInstructions}>
            <MaterialIcons name="info-outline" size={20} color={accent} />
            <Text style={styles.sortingInstructionsText}>
              To sort images, press any image you want to sort and then select the position you want the image to be placed.
            </Text>
          </View>
        )}

        {/* Pick Images Button */}
        {!pdfUri && !isSorting && (
          <TouchableOpacity
            style={[styles.pickBtn, (images.length >= 500 || isAddingImages || loading || isCompressing) && styles.pickBtnDisabled]}
            onPress={pickImages}
            activeOpacity={0.8}
            disabled={images.length >= 500 || isAddingImages || loading || isCompressing}
          >
            {isAddingImages ? (
              <>
                <ActivityIndicator color={colors.textPrimary} size="small" />
                <Text style={styles.pickBtnText}>Adding Images...</Text>
              </>
            ) : (
              <>
                <Ionicons name="images" size={24} color={colors.textPrimary} />
                <Text style={styles.pickBtnText}>
                  {images.length === 0 ? 'Pick Images' : images.length >= 500 ? 'Max Images Reached' : 'Add More Images'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Options */}
        {images.length > 0 && !pdfUri && !isSorting && (
          <View style={styles.optionsContainer}>
            {/* Frame Toggle */}
            <TouchableOpacity
              style={styles.frameToggle}
              onPress={() => {
                const newValue = !showFrames;
                setShowFrames(newValue);

                // Animate toggle
                Animated.timing(frameToggleAnimation, {
                  toValue: newValue ? 1 : 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start();
              }}
              activeOpacity={0.7}
              disabled={loading || isCompressing}
            >
              <View style={styles.frameToggleContent}>
                <MaterialIcons name="crop-din" size={20} color={colors.textPrimary} />
                <Text style={styles.frameToggleText}>Show Frames in PDF</Text>
              </View>
              <View style={[styles.toggleSwitch, showFrames && styles.toggleSwitchActive]}> 
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{
                        translateX: frameToggleAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 24.5]
                        })
                      }]
                    }
                  ]}
                />
              </View>
            </TouchableOpacity>

            {/* Page Size Selector */}
            <TouchableOpacity
              style={styles.pageSizeBtn}
              onPress={() => setPageSizeModalVisible(true)}
              activeOpacity={0.7}
              disabled={loading || isCompressing}
            >
              <MaterialCommunityIcons name="fit-to-page" size={20} color={colors.textPrimary} />
              <Text style={styles.pageSizeBtnLabel}>Page Size</Text>
              <View style={styles.pageSizeBtnRight}>
                <Text style={styles.pageSizeBtnValue}>{pageSize}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.pageSizeBtn}
              onPress={() => {
                setTempPdfName(pdfName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={loading || isCompressing}
            >
              <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              <Text style={styles.pageSizeBtnLabel}>Rename PDF</Text>
              <View style={styles.pageSizeBtnRight}>
                <Text style={styles.pageSizeBtnValue}>
                  {pdfName
                    ? (pdfName.length > 17 ? pdfName.substring(0, 17) + '...' : pdfName)
                    : 'Default'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Password Toggle */}
            <TouchableOpacity
              style={styles.frameToggle}
              onPress={() => {
                if (passwordEnabled) {
                  setPasswordEnabled(false);
                  setPdfPassword('');
                  Animated.timing(passwordToggleAnimation, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start();
                } else {
                  setTempPdfPassword(pdfPassword);
                  setShowPasswordInput(false);
                  setPasswordModalVisible(true);
                }
              }}
              activeOpacity={0.7}
              disabled={loading || isCompressing}
            >
              <View style={styles.frameToggleContent}>
                <MaterialCommunityIcons name={passwordEnabled ? 'lock' : 'lock-open-outline'} size={20} color={colors.textPrimary} />
                <Text style={styles.frameToggleText}>Password Protect</Text>
              </View>
              <View style={[styles.toggleSwitch, passwordEnabled && styles.toggleSwitchActive]}>
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{
                        translateX: passwordToggleAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 24.5]
                        })
                      }]
                    }
                  ]}
                />
              </View>
            </TouchableOpacity>

            {/* Compression Quality Selector */}
            <TouchableOpacity
              style={styles.pageSizeBtn}
              onPress={() => setQualityModalVisible(true)}
              activeOpacity={0.7}
              disabled={loading || isCompressing}
            >
              <FontAwesome5 name="compress" size={20} color={colors.textPrimary} />
              <Text style={styles.pageSizeBtnLabel}>PDF Quality</Text>
              <View style={styles.pageSizeBtnRight}>
                <Text style={styles.pageSizeBtnValue}>
                  {compressionQuality === 'original' ? 'Original' : compressionQuality === 'high' ? 'High' : compressionQuality === 'balanced' ? 'Balanced' : 'Small'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Convert Button */}
        {images.length > 0 && !pdfUri && !isSorting && (
          <TouchableOpacity
            style={[styles.convertBtn, (loading || isCompressing) && styles.btnDisabled]}
            onPress={handleConvertPress}
            activeOpacity={0.8}
            disabled={loading || isCompressing}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <FontAwesome5 name="file-pdf" size={18} color="#fff" />
            )}
            <Text style={styles.convertBtnText}>
              {loading ? 'Converting...' : 'Convert to PDF'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Success / Result Section */}
        {pdfUri && (
          <View style={styles.resultSection}>
            <View style={[styles.successBadge,{marginBottom:12}]}>
              <Ionicons name="checkmark-circle" size={28} color={accent} />
              <View>
                <Text style={styles.successText}>PDF Created Successfully!</Text>
              </View>
            </View>
            <View style={styles.successBadge}>
              <View>
                <Text style={styles.successText}>Created PDF Size: {formatSize(pdfSize)}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.saveActionBtn, saving && { opacity: 0.6 }]} onPress={savePdf} activeOpacity={0.8} disabled={saving || loading || isCompressing}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveActionBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={sharePdf} activeOpacity={0.8} disabled={loading || isCompressing}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.showPdfBtn} onPress={showPdf} activeOpacity={0.8} disabled={loading || isCompressing}>
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.showPdfBtnText}>Show PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.generateAgainBtn} onPress={resetToPdfGeneration} activeOpacity={0.8} disabled={loading || isCompressing}>
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.generateAgainBtnText}>Generate Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Full Image Preview with Zoom */}
      <ImageViewing
        images={images.map(img => ({ uri: img.uri }))}
        imageIndex={previewIndex !== null ? previewIndex : 0}
        visible={previewIndex !== null}
        onRequestClose={() => setPreviewIndex(null)}
        presentationStyle="overFullScreen"
        HeaderComponent={() => (
          <View style={styles.imageViewerHeader}>
            <TouchableOpacity
              style={styles.imageViewerCloseBtn}
              onPress={() => setPreviewIndex(null)}
            >
              <Ionicons name="close" size={28} color="#000000" />
            </TouchableOpacity>
          </View>
        )}
        FooterComponent={({ imageIndex }) => (
          <View style={styles.imageViewerFooter}>
            <Text style={styles.imageViewerCounter}>
              {imageIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      />

      {/* Edit Modal */}
      <Modal
        visible={editIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <View style={styles.editModalOverlay}>
          {/* Header */}
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={closeEditModal} style={styles.editCloseBtn}>
              <Ionicons name="close" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.editHeaderButtons}>
              {hasChanges && (
                <TouchableOpacity
                  onPress={revertToOriginal}
                  style={styles.revertBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={20} color={colors.textPrimary} />
                  <Text style={styles.revertBtnText}>Revert</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={saveEdits}
                disabled={isProcessing}
                style={styles.saveBtn}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Toast for Edit Modal */}
          {editModalToast && (
            <View style={styles.editModalToastContainer}>
              <View style={styles.editModalToastContent}>
                <MaterialIcons name="info-outline" size={20} color={accent} />
                <Text style={styles.editModalToastText}>{editModalToast}</Text>
              </View>
            </View>
          )}

          {/* Image Preview Area */}
          <View style={styles.editImageContainer}>
            {editIndex !== null && (
              <View style={styles.editImageWrapper}>
                <View style={styles.imageWrapper}>
                  {/* Display version for preview */}
                  <ColorMatrix matrix={getColorMatrix()}>
                    <Image
                      source={{ uri: images[editIndex]?.uri }}
                      style={[
                        styles.editImage,
                        {
                          transform: [{ rotate: `${rotation}deg` }],
                        }
                      ]}
                      resizeMode="contain"
                    />
                  </ColorMatrix>

                  {/* Hidden version for capture - actual image size */}
                  {captureImageSize.width > 0 && (
                    <View style={{ position: 'absolute', left: -10000, top: 0 }}>
                      <View ref={imageViewRef} collapsable={false}>
                        <ColorMatrix matrix={getColorMatrix()}>
                          <Image
                            source={{ uri: images[editIndex]?.uri }}
                            style={{
                              width: captureImageSize.width,
                              height: captureImageSize.height,
                              transform: [{ rotate: `${rotation}deg` }],
                            }}
                          />
                        </ColorMatrix>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Controls */}
          <View style={styles.editControlsWrapper}>
            <View style={styles.editControls}>
            {/* Current Image Counter */}
            <View style={styles.editImageCountDisplay}>
              <Text style={styles.editImageCountText}>
                Image {editIndex !== null ? editIndex + 1 : 0} of {images.length}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {/* Rotate Left Button */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={rotateLeft}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="rotate-left" size={24} color={colors.textPrimary} />
                <Text style={styles.actionBtnText}>Rotate Left</Text>
              </TouchableOpacity>

              {/* Rotate Right Button */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={rotateRight}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="rotate-right" size={24} color={colors.textPrimary} />
                <Text style={styles.actionBtnText}>Rotate Right</Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Crop Modal (in-app, embedded CropView) */}
      <Modal
        visible={cropModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={closeCropModal}
        statusBarTranslucent
      >
        <View style={styles.cropModalContainer}>
          {/* Top bar */}
          <View style={styles.cropTopBar}>
            <TouchableOpacity onPress={closeCropModal} style={styles.cropTopBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cropTopTitle}>Crop</Text>
            <TouchableOpacity
              onPress={handleCropSavePress}
              style={[styles.cropTopBtn, styles.cropSaveBtn]}
              activeOpacity={0.7}
              disabled={cropProcessing}
            >
              {cropProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cropSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* CropView */}
          <View style={styles.cropViewWrapper}>
            {cropSourceIndex !== null && images[cropSourceIndex] && (
              <CropView
                ref={cropViewRef}
                sourceUrl={images[cropSourceIndex].uri}
                style={styles.cropView}
                onImageCrop={handleCropResult}
                keepAspectRatio={false}
              />
            )}
          </View>

          {/* Bottom toolbar */}
          <View style={styles.cropBottomBar}>
            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={handleCropRotateLeft}
              activeOpacity={0.7}
              disabled={cropProcessing}
            >
              <MaterialCommunityIcons name="rotate-left" size={26} color="#fff" />
              <Text style={styles.cropToolBtnText}>Rotate Left</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={handleCropRotateRight}
              activeOpacity={0.7}
              disabled={cropProcessing}
            >
              <MaterialCommunityIcons name="rotate-right" size={26} color="#fff" />
              <Text style={styles.cropToolBtnText}>Rotate Right</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filters Modal */}
      <Modal
        visible={filtersModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersModalVisible(false)}
      >
        <Pressable style={styles.filtersModalOverlay} onPress={() => setFiltersModalVisible(false)}>
          <Pressable style={styles.filtersModalContent} onPress={() => {}}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>Select Filter</Text>
              <TouchableOpacity onPress={() => setFiltersModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filtersScrollView}>
              {/* No Filter Option */}
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  !activeFilter && styles.filterOptionActive
                ]}
                onPress={() => selectFilter(null)}
                activeOpacity={0.7}
              >
                <View style={styles.filterOptionLeft}>
                  <MaterialIcons name="clear" size={24} color={colors.textPrimary} />
                  <Text style={styles.filterOptionText}>No Filter</Text>
                </View>
                {!activeFilter && (
                  <Ionicons name="checkmark-circle" size={24} color={accent} />
                )}
              </TouchableOpacity>

              {/* Grayscale Filter */}
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  activeFilter === 'grayscale' && styles.filterOptionActive
                ]}
                onPress={() => selectFilter('grayscale')}
                activeOpacity={0.7}
              >
                <View style={styles.filterOptionLeft}>
                  <MaterialIcons name="filter-b-and-w" size={24} color={colors.textPrimary} />
                  <Text style={styles.filterOptionText}>Grayscale</Text>
                </View>
                {activeFilter === 'grayscale' && (
                  <Ionicons name="checkmark-circle" size={24} color={accent} />
                )}
              </TouchableOpacity>

              {/* Sepia Filter */}
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  styles.filterOptionLast,
                  activeFilter === 'sepia' && styles.filterOptionActive
                ]}
                onPress={() => selectFilter('sepia')}
                activeOpacity={0.7}
              >
                <View style={styles.filterOptionLeft}>
                  <MaterialIcons name="palette" size={24} color={colors.textPrimary} />
                  <Text style={styles.filterOptionText}>Sepia</Text>
                </View>
                {activeFilter === 'sepia' && (
                  <Ionicons name="checkmark-circle" size={24} color={accent} />
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Page Size Modal */}
      <Modal
        visible={pageSizeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPageSizeModalVisible(false)}
      >
        <Pressable style={styles.pageSizeModalOverlay} onPress={() => setPageSizeModalVisible(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.pageSizeModalContent} onPress={() => {}}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>Select Page Size</Text>
              <TouchableOpacity onPress={() => setPageSizeModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pageSizeScrollView} showsVerticalScrollIndicator={false}>
              {Object.keys(PAGE_SIZES).map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.filterOption,
                    pageSize === size && styles.filterOptionActive
                  ]}
                  onPress={() => {  
                    setPageSize(size);
                    setPageSizeModalVisible(false);
                    triggerToast('Page Size', `Set to ${size}`, 'info', 2000);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.filterOptionLeft}>
                    <MaterialIcons name="description" size={24} color={colors.textPrimary} />
                    <View>
                      <Text style={styles.filterOptionText}>{size}</Text>
                      <Text style={styles.pageSizeSubtext}>{PAGE_SIZES[size].label}</Text>
                    </View>
                  </View>
                  {pageSize === size && (
                    <Ionicons name="checkmark-circle" size={24} color={accent} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort Position Modal */}
      <Modal
        visible={sortPositionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortPositionModalVisible(false)}
      >
        <Pressable style={styles.pageSizeModalOverlay} onPress={() => setSortPositionModalVisible(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.pageSizeModalContent} onPress={() => {}}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>Select Position</Text>
              <TouchableOpacity onPress={() => setSortPositionModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pageSizeScrollView} showsVerticalScrollIndicator={false}>
              {images.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.filterOption,
                    selectedImageForSort === index && styles.filterOptionActive
                  ]}
                  onPress={() => moveImageToPosition(index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.filterOptionLeft}>
                    <MaterialIcons name="filter" size={24} color={colors.textPrimary} />
                    <Text style={styles.filterOptionText}>Position {index + 1}</Text>
                  </View>
                  {selectedImageForSort === index && (
                    <Ionicons name="checkmark-circle" size={24} color={accent} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Compression Progress Modal */}
      <Modal
        visible={isCompressing}
        transparent
        animationType="fade"
      >
        <View style={styles.compressionModalOverlay}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <View style={styles.compressionModalBox}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.compressionModalTitle}>Processing Images</Text>
            <Text style={styles.compressionModalText}>
              {compressionProgress.current} of {compressionProgress.total}
            </Text>
          </View>
        </View>
      </Modal>

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
              <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
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

      {/* Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.renameModalOverlay}>
              <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
              <TouchableWithoutFeedback>
                <View style={styles.renameModalBox}>
                  <Text style={styles.renameModalTitle}>Set PDF Password</Text>

                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter password..."
                      placeholderTextColor={colors.textSecondary}
                      value={tempPdfPassword}
                      onChangeText={setTempPdfPassword}
                      secureTextEntry={!showPasswordInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={styles.passwordEyeBtn}
                      onPress={() => setShowPasswordInput(!showPasswordInput)}
                    >
                      <Ionicons
                        name={showPasswordInput ? 'eye-off' : 'eye'}
                        size={22}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {tempPdfPassword.length > 0 && tempPdfPassword.length < 4 && (
                    <Text style={styles.passwordHint}>Password must be at least 4 characters</Text>
                  )}

                  <View style={[styles.renameButtonsContainer, { marginTop: 20 }]}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => {
                        setPasswordModalVisible(false);
                        setTempPdfPassword('');
                        setPasswordEnabled(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.renameDoneButton, tempPdfPassword.length < 4 && { opacity: 0.5 }]}
                      onPress={() => {
                        if (tempPdfPassword.trim().length < 4) {
                          triggerToast('Error', 'Password must be at least 4 characters', 'error', 2000);
                          return;
                        }
                        setPdfPassword(tempPdfPassword.trim());
                        setPasswordEnabled(true);
                        setPasswordModalVisible(false);
                        Animated.timing(passwordToggleAnimation, {
                          toValue: 1,
                          duration: 200,
                          useNativeDriver: true,
                        }).start();
                        triggerToast('Success', 'Password protection enabled', 'success', 2000);
                      }}
                      activeOpacity={0.8}
                      disabled={tempPdfPassword.length < 4}
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

      {/* Quality Selector Modal */}
      <Modal
        visible={qualityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQualityModalVisible(false)}
      >
        <Toaster/>
        <Pressable style={styles.pageSizeModalOverlay} onPress={() => setQualityModalVisible(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.pageSizeModalContent} onPress={() => {}}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>Select PDF Quality</Text>
              <TouchableOpacity onPress={() => setQualityModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pageSizeScrollView} showsVerticalScrollIndicator={false}>
              {[
                { key: 'original', label: 'Original Quality', desc: 'No compression, original photo quality', icon: 'check-decagram', iconLib: 'MaterialCommunityIcons' },
                { key: 'high', label: 'High Quality', desc: 'Best for text/documents (1200px, 80%)', icon: 'ultra-high-definition', iconLib: 'MaterialCommunityIcons' },
                { key: 'balanced', label: 'Balanced', desc: 'Good for mixed content (700px, 50%)', icon: 'hd', iconLib: 'MaterialIcons' },
                { key: 'small', label: 'Small File', desc: 'Smallest size (500px, 30%)', icon: 'quality-low', iconLib: 'MaterialCommunityIcons' }
              ].map((quality, index) => {
                return (
                <TouchableOpacity
                  key={quality.key}
                  style={[
                    styles.filterOption,
                    compressionQuality === quality.key && styles.filterOptionActive,
                    index === 3 && styles.filterOptionLast,
                  ]}
                  onPress={() => {
                    setCompressionQuality(quality.key);
                    setQualityModalVisible(false);
                    triggerToast('PDF Quality', `Set to ${quality.label}`, 'info', 2000);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.filterOptionLeft}>
                    {quality.iconLib === 'MaterialCommunityIcons' ? (
                      <MaterialCommunityIcons name={quality.icon} size={24} color={colors.textPrimary} />
                    ) : (
                      <MaterialIcons name={quality.icon} size={24} color={colors.textPrimary} />
                    )}
                    <View>
                      <Text style={styles.filterOptionText}>{quality.label}</Text>
                      <Text style={styles.pageSizeSubtext}>{quality.desc}</Text>
                    </View>
                  </View>
                  {compressionQuality === quality.key && (
                    <Ionicons name="checkmark-circle" size={24} color={accent} />
                  )}
                </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Excessive PDF Size Warning Modal */}
      <Modal
        visible={warningModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWarningModalVisible(false)}
      >
        <View style={styles.renameModalOverlay}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <View style={styles.renameModalBox}>
            <View style={styles.warningHeader}>
              <MaterialCommunityIcons name="alert-circle" size={28} color="#FF9800" />
              <Text style={styles.renameModalTitle}>Excessive Big PDF</Text>
            </View>

            <Text style={styles.warningDesc}>
              The PDF you're about to create is approximately{' '}
              <Text style={styles.warningSizeText}>{formatSize(estimatedOutputBytes)}</Text>.
              {'\n\n'}
              Most free PDF readers (Google Drive, built-in Android viewers, WhatsApp preview) cannot open files this large. To view the result you'll need a robust PDF reader such as Adobe Acrobat or Foxit Reader.
              {'\n\n'}
              Please proceed only if you understand the limitation. Otherwise, switch to a smaller quality preset.
            </Text>

            <View style={styles.renameButtonsContainer}>
              <TouchableOpacity
                style={styles.renameCancelButton}
                onPress={() => setWarningModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.renameCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.renameDoneButton}
                onPress={() => {
                  setWarningModalVisible(false);
                  convertToPdf();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.renameDoneButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Viewer Modal */}
      <Modal
        visible={pdfViewerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => { setPdfViewerVisible(false); setViewerNeedsPassword(false); setViewerPasswordInput(''); setViewerPassword(''); setViewerPasswordError(''); }}
      >
        <View style={styles.pdfViewerContainer}>
          <View style={styles.pdfViewerHeader}>
            <Text style={styles.pdfViewerTitle}>PDF Preview</Text>
            <TouchableOpacity
              onPress={() => { setPdfViewerVisible(false); setViewerNeedsPassword(false); setViewerPasswordInput(''); setViewerPassword(''); setViewerPasswordError(''); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {pdfViewerVisible && pdfUri ? (
            viewerNeedsPassword ? (
              <View style={styles.passwordContainer}>
                <Ionicons name="lock-closed" size={48} color={accent} />
                <Text style={styles.passwordTitle}>Password Protected</Text>
                <Text style={styles.passwordDesc}>This PDF requires a password to open</Text>
                <TextInput
                  style={[{ width: '100%', backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: isDark ? '#3a3a3a' : '#e0e0e0' }, viewerPasswordError && styles.passwordInputError]}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textMuted}
                  value={viewerPasswordInput}
                  onChangeText={(t) => { setViewerPasswordInput(t); setViewerPasswordError(''); }}
                  secureTextEntry
                  autoFocus
                  onSubmitEditing={() => {
                    if (!viewerPasswordInput.trim()) return;
                    setViewerPassword(viewerPasswordInput.trim());
                    setViewerPasswordError('');
                    setViewerNeedsPassword(false);
                  }}
                />
                {viewerPasswordError ? (
                  <Text style={styles.passwordErrorText}>{viewerPasswordError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.passwordBtn, !viewerPasswordInput.trim() && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!viewerPasswordInput.trim()) return;
                    setViewerPassword(viewerPasswordInput.trim());
                    setViewerPasswordError('');
                    setViewerNeedsPassword(false);
                  }}
                  activeOpacity={0.8}
                  disabled={!viewerPasswordInput.trim()}
                >
                  <Text style={styles.passwordBtnText}>Unlock PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Pdf
                source={{ uri: pdfUri }}
                style={styles.pdfView}
                trustAllCerts={false}
                password={viewerPassword || undefined}
                onLoadComplete={(numberOfPages) => {
                  console.log(`PDF loaded with ${numberOfPages} pages`);
                }}
                onError={(error) => {
                  const errMsg = String(error);
                  if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('encrypt')) {
                    if (viewerPassword) {
                      setViewerPasswordError('Incorrect password. Please try again.');
                    }
                    setViewerNeedsPassword(true);
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
            )
          ) : null}
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
    paddingBottom: 80,
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

  // Image Section
  imageSection: {
    marginTop: 16,
    marginBottom: 6,
  },
  imageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageSectionTitle: {
    color: colors.sectionSubtitle,
    fontSize: 14,
    fontWeight: '600',
  },
  sortingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  sortingBadgeText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  headerButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  clearAllBtn: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  clearAllText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sortBtn: {
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  sortBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Sort Mode Full-Screen
  sortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sortHeaderLeft: {
    flex: 1,
  },
  sortHeading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  sortSubheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sortHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sortInfoBtn: {
    padding: 4,
  },
  sortDoneBtn: {
    backgroundColor: accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 50,
  },
  sortDoneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  sortScrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 100,
  },

  // Sort Info Modal
  sortInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortInfoModalBox: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    marginHorizontal: 30,
    width: '85%',
  },
  sortInfoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sortInfoModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sortInfoModalDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  sortInfoModalCloseBtn: {
    backgroundColor: accent,
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: 'center',
  },
  sortInfoModalCloseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.4,
  },
  sortingInstructions: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  sortingInstructionsText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  horizontalScroll: {
    gap: 14,
    paddingVertical: 14,
    paddingRight: 20,
  },
  imageItemContainer: {
    marginRight: 14,
  },
  thumbWrapper: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#D3DAE5',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  editBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#8b8b8b',
    borderRadius: 46,
    paddingHorizontal: 18,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  editBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#FF0000',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  expandBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  moveBtn: {
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveBtnDisabled: {
    opacity: 0.3,
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
    marginTop: 4,
    gap: 10,
  },
  pickBtnDisabled: {
    opacity: 0.4,
  },
  pickBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Options Container
  optionsContainer: {
    gap: 10,
    marginTop: 12,
  },

  // Frame Toggle
  frameToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },

  // Page Size Button
  pageSizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 19,
    gap: 10,
  },
  pageSizeBtnLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  pageSizeBtnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageSizeBtnValue: {
    color: accent,
    fontSize: 15,
    fontWeight: '600',
  },
  frameToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  frameToggleText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  toggleSwitch: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.textMuted || '#666',
    padding: 4,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: accent,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },

  // Convert Button
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 14,
    gap: 10,
  },
  convertBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Result Section
  resultSection: {
    marginTop: 20,
  },
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
  successSize: {
    color: accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  saveActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.saveBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
  },
  saveActionBtnText: { color: colors.saveBtnText, fontSize: 16, fontWeight: '700' },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.shareBtnBg, borderRadius: 60, paddingVertical: 16, gap: 10,
  },
  shareBtnText: {
    color: colors.shareBtnText,
    fontSize: 16,
    fontWeight: '700',
  },
  showPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF0000',
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 12,
    gap: 10,
  },
  showPdfBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
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
  },
  generateAgainBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  // Preview Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  navArrowLeft: {
    left: 20,
  },
  navArrowRight: {
    right: 20,
  },
  previewImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.7,
  },
  previewText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },

  // Edit Modal
  editModalOverlay: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    paddingBottom: 16,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border2 || (isDark ? '#2a2a2a' : '#e0e0e0'),
  },
  editCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalToastContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 80 : 124,
    left: 20,
    right: 20,
    zIndex: 10000,
    alignItems: 'center',
  },
  editModalToastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: isDark ? '#404040' : '#d0d0d0',
  },
  editModalToastText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  editHeaderText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  editHeaderButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  revertBtn: {
    backgroundColor: isDark ? '#3a3a3a' : '#d0d0d0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  revertBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  editImageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: isDark ? colors.bg : '#e5e5e5',
  },
  editImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  imageWrapper: {
    position: 'relative',
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.5,
  },
  editImage: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_HEIGHT * 0.5,
  },
  editImageCounter: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 20,
  },
  editControlsWrapper: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: isDark ? '#1a1a1a' : '#e5e5e5',
  },
  editControls: {
    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  editImageCountDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  editImageCountText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  applyToAllToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#2a2a2a' : '#e8e8e8',
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 24,
  },
  applyToAllContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  applyToAllText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  controlSection: {
    marginBottom: 24,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  controlLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  controlValue: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  sliderContainer: {
    paddingHorizontal: 10,
    overflow: 'visible',
  },
  slider: {
    width: '100%',
    height: 50,
    transform: [{ scaleX: 1 }, { scaleY: 1.8 }],
  },
  cropBtn: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 66,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cropBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  // In-app Crop Modal styles
  cropModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cropTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 50,
    paddingBottom: 12,
    backgroundColor: '#000',
  },
  cropTopBtn: {
    minWidth: 60,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropTopTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cropSaveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 22,
    paddingHorizontal: 18,
  },
  cropSaveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cropViewWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  cropView: {
    flex: 1,
  },
  cropBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 70,
    backgroundColor: '#111',
    gap: 16,
    paddingHorizontal: 16,
  },
  cropToolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 50,
    gap: 8,
  },
  cropToolBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 50,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 66,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  filtersBtn: {
    position: 'relative',
  },
  filtersBtnFull: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 66,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: accent,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Filters Modal
  filtersModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filtersModalContent: {
    backgroundColor: colors.modalBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
  },
  filtersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  filtersModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  filtersScrollView: {
    gap: 0,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 70,
    marginBottom: 15,
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterOptionLast: {
    marginBottom: 30,
  },
  filterOptionActive: {
    borderColor: accent,
    backgroundColor: accent + '15',
  },
  filterOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pageSizeSubtext: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Page Size Modal
  pageSizeModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pageSizeModalContent: {
    backgroundColor: colors.modalBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    maxHeight: '70%',
  },
  pageSizeScrollView: {
    flexGrow: 0,
  },

  // PDF Viewer Modal
  // Compression Progress Modal
  compressionModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compressionModalBox: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    minWidth: 250,
  },
  compressionModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  compressionModalText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Excessive PDF Size Warning Modal
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  warningSizeText: {
    color: '#FF9800',
    fontWeight: '800',
  },

  // Rename Modal
  renameModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  renameModalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
  },
  renameModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  renameInput: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    marginBottom: 20,
  },
  renameButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  renameCancelButton: {
    flex: 1,
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    paddingVertical: 16,
    borderRadius: 60,
    alignItems: 'center',
  },
  renameCancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  renameDoneButton: {
    flex: 1,
    backgroundColor: accent,
    paddingVertical: 16,
    borderRadius: 60,
    alignItems: 'center',
  },
  renameDoneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    height: 56,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    height: 56,
    paddingVertical: 0,
  },
  passwordEyeBtn: {
    padding: 6,
    marginLeft: 8,
  },
  passwordContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  passwordTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  passwordDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  passwordInputError: {
    borderColor: '#F44336',
  },
  passwordErrorText: {
    color: '#F44336',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 8,
  },
  passwordBtn: {
    backgroundColor: accent,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 60,
    marginTop: 16,
  },
  passwordBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  passwordHint: {
    fontSize: 12,
    color: ACCENT,
    marginTop: 8,
    fontWeight: '500',
  },

  pdfViewerContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
  pdfViewerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
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

  // ImageViewing Header
  imageViewerHeader: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  imageViewerCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgb(255, 255, 255)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation:10
  },

  // ImageViewing Footer
  imageViewerFooter: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'android' ? 70 : 70,
  },
  imageViewerCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});

export default ImageToPdf;
