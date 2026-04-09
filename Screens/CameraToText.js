import { useState, useMemo, useRef, useEffect } from "react";
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
  Share,
  Modal,
} from "react-native";
import { Ionicons, Entypo, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "@react-native-community/blur";
import { useTheme } from "../Services/ThemeContext";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";
import MlkitOcr from "react-native-mlkit-ocr";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { triggerToast } from "../Services/toast";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCENT = "#FF6F00";
const ACCENT_LIGHT = "#FF8F00";

const CameraToText = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [dontShowWarning, setDontShowWarning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTextFoundOnImage, setIsTextFoundOnImage] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isVoiceLoading,setIsVoiceLoading] = useState(false);
  const [showSpeakInfoModal, setShowSpeakInfoModal] = useState(false);

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(
    () => createStyles(colors, accent, isDark),
    [colors, accent, isDark],
  );

  // Camera setup
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef(null);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);

  // Load warning preference on mount
  useEffect(() => {
    const loadWarningPreference = async () => {
      try {
        const value = await AsyncStorage.getItem("liveCameraWarningDismissed");
        if (value === "true") {
          setDontShowWarning(true);
        }
      } catch (error) {
        console.error("Error loading warning preference:", error);
      }
    };
    loadWarningPreference();
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (isTextFoundOnImage) {
        setIsTextFoundOnImage(false);
      }
    }, 3500);
  }, [isTextFoundOnImage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scanIntervalRef.current = null;
      isScanningRef.current = false;
      // Stop speech on unmount
      Speech.stop();
    };
  }, []);

  const performOCR = async (imageUri, isLiveScanning = false) => {
    try {
      if (!isTextFoundOnImage) {
        setLoading(true);
        console.log("Performing OCR on:", imageUri);
        const result = await MlkitOcr.detectFromUri(imageUri);
        console.log("OCR Result:", result);

        if (result && result.length > 0 && !isTextFoundOnImage) {
          if (isLiveScanning) {
            setIsTextFoundOnImage(true);
          }
          stopCamera();
          const text = result.map((block) => block.text).join("\n");
          console.log("Extracted text:", text);
          setExtractedText(text);
          setSelectedImage(imageUri);
          triggerToast(
            "Success",
            "Text extracted successfully!",
            "success",
            2000,
          );
          return true;
        } else {
          console.log("No text detected");
          setExtractedText("");
          setSelectedImage(imageUri);
          // Only show toast if not live scanning
          if (!isLiveScanning) {
            triggerToast(
              "No Text",
              "No text detected in the image",
              "alert",
              2000,
            );
          }
          return false;
        }
      }
    } catch (error) {
      console.error("OCR Error:", error);
      triggerToast("Error", `OCR failed: ${error.message}`, "alert", 3000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startAutoScan = async () => {
    // Check if we should stop scanning
    if (!scanIntervalRef.current || !isScanningRef.current) {
      console.log("Scan stopped");
      return;
    }

    if (!camera.current) {
      console.log("Camera not ready, retrying...");
      // Retry after a short delay
      setTimeout(() => startAutoScan(), 500);
      return;
    }

    try {
      if (!isTextFoundOnImage) {
        console.log("Taking photo for auto scan...");
        const photo = await camera.current.takePhoto({
          qualityPrioritization: "speed",
          flash: "off",
        });

        console.log("Photo taken:", photo.path);
        // Use proper file URI format based on platform
        let imageUri = photo.path;
        if (!imageUri.startsWith("file://")) {
          imageUri = `file://${imageUri}`;
        }

        console.log("Processing URI:", imageUri);
        const textFound = await performOCR(imageUri, true);

        if (textFound) {
          // Text detected - stop scanning
          console.log("Text found! Stopping camera...");
          stopCamera();
        } else {
          console.log("No text found, continuing to scan...");
        }
      }
    } catch (error) {
      console.error("Auto scan error:", error);
      // Check if it's because camera was closed
      if (error.message && error.message.includes("closed")) {
        console.log("Camera was closed, stopping scan");
        return;
      }
      // Don't show toast for every error, just log it
      console.log("Will retry on next interval...");
    }
  };

  const startLiveCamera = async () => {
    if (!hasPermission) {
      const permission = await requestPermission();
      if (!permission) {
        triggerToast(
          "Permission Denied",
          "Camera permission is required",
          "alert",
          3000,
        );
        return;
      }
    }
    setExtractedText("");
    setSelectedImage("");
    setIsCameraActive(true);
    setIsScanning(true);

    // Set scanning flags
    scanIntervalRef.current = true;
    isScanningRef.current = true;

    // Wait for camera to initialize before starting scan
    setTimeout(() => {
      console.log("Starting auto-scan interval...");
      // Start auto-scanning every 1.5 seconds
      const interval = setInterval(() => {
        if (!scanIntervalRef.current || !isScanningRef.current) {
          clearInterval(interval);
          return;
        }
        startAutoScan();
      }, 1500);
    }, 1000); // Give camera 1 second to initialize
  };

  const openLiveCamera = () => {
    if (dontShowWarning) {
      startLiveCamera();
    } else {
      setShowWarningModal(true);
    }
  };

  const handleDontShowAgain = async (checked) => {
    setDontShowWarning(checked);
    try {
      await AsyncStorage.setItem(
        "liveCameraWarningDismissed",
        checked ? "true" : "false",
      );
    } catch (error) {
      console.error("Error saving warning preference:", error);
    }
  };

  const stopCamera = () => {
    console.log("Stopping camera...");
    // Set refs first to stop any ongoing scans
    scanIntervalRef.current = null;
    isScanningRef.current = false;
    // Then update state
    setIsCameraActive(false);
    setIsScanning(false);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      triggerToast(
        "Permission Denied",
        "Camera permission is required to capture images",
        "alert",
        3000,
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const imageUri = result.assets[0].uri;
      setSelectedImage(imageUri);
      await performOCR(imageUri);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      triggerToast(
        "Permission Denied",
        "Gallery permission is required to select images",
        "alert",
        3000,
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const imageUri = result.assets[0].uri;
      setSelectedImage(imageUri);
      await performOCR(imageUri);
    }
  };

  const copyToClipboard = async () => {
    if (extractedText) {
      await Clipboard.setStringAsync(extractedText);
      triggerToast("Copied", "Text copied to clipboard", "success", 2000);
    }
  };

  const shareText = async () => {
    if (extractedText) {
      try {
        await Share.share({
          message: extractedText,
        });
      } catch (error) {
        console.error("Share Error:", error);
      }
    }
  };

  const speakFromWord = async (wordIndex) => {
    setIsVoiceLoading(true)
    if (!extractedText) return;

    const words = extractedText.split(/\s+/);
    const textToSpeak = words.slice(wordIndex).join(" ");

    // Stop any existing speech
    await Speech.stop();

    // Small delay to ensure stop completes
    await new Promise((resolve) => setTimeout(resolve, 100));
   

    // Set state after stop completes
    setIsSpeaking(true);
    setCurrentWordIndex(wordIndex);
 
    Speech.speak(textToSpeak, {
      onStart: () => {
      setIsVoiceLoading(false);  // Stop loader when voice actually starts
      setIsSpeaking(true);
      setCurrentWordIndex(wordIndex);
    },
      onDone: () => {
        setIsSpeaking(false);
        setCurrentWordIndex(-1);
      },
      onStopped: () => {
        setIsSpeaking(false);
        setCurrentWordIndex(-1);
      },
      onError: () => {
        setIsSpeaking(false);
        setCurrentWordIndex(-1);
        triggerToast("Error", "Failed to speak text", "alert", 2000);
      },
    });
  };

  const speakText = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      setIsVoiceLoading(true);
      speakFromWord(0);
    }
  };

  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
    setCurrentWordIndex(-1);
    setIsVoiceLoading(false);
  };

  const clearAll = () => {
    setExtractedText("");
    setSelectedImage(null);
    stopCamera();
    if (isSpeaking) {
      stopSpeaking();
    }
  };
 
  if (isCameraActive && device) {
    return (
      <View style={styles.cameraContainer}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isCameraActive}
          photo={true}
        />

        {/* Camera Overlay */}
        <View style={styles.cameraOverlay}>
          {/* Header */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              onPress={stopCamera}
              style={styles.cameraCloseBtn}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Point at text</Text>
          </View>

          {/* Scanning indicator */}
          {isScanning && (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.scanningText}>Scanning for text...</Text>
            </View>
          )}

          {/* Guide frame */}
          <View style={styles.guideFrame} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Camera to Text</Text>
        {(extractedText || selectedImage) && (
          <TouchableOpacity
            onPress={clearAll}
            style={styles.clearBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        {!extractedText && !selectedImage && (
          <View style={styles.emptyState}>
            <Entypo name="camera" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No text extracted yet</Text>
            <Text style={styles.emptyDesc}>
              Use auto-detect camera or select an image to extract text using
              OCR
            </Text>
          </View>
        )}

        {/* Selected Image Preview */}
        {selectedImage && (
          <View style={styles.imagePreviewSection}>
            <Text style={styles.sectionTitle}>Selected Image</Text>
            <TouchableOpacity
              style={styles.imagePreviewContainer}
              onPress={() => setShowImageModal(true)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: selectedImage }}
                style={styles.imagePreview}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Extracted Text Section */}
        {selectedImage && (
          <View style={styles.textSection}>
            <Text style={styles.sectionTitle}>Extracted Text</Text>
            <View style={styles.textContainer}>
              {/* Expand Button - Top Right (only if text exists) */}
              {extractedText && (
                <TouchableOpacity
                  onPress={() => setShowTextModal(true)}
                  style={styles.expandBtn}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="arrow-expand"
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              )}
              <ScrollView
                style={styles.textScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {extractedText ? (
                  <View style={styles.wordsContainer}>
                    {extractedText.split(/\s+/).map((word, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => speakFromWord(index)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.extractedText}>{word} </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noTextDetected}>No text detected</Text>
                )}
              </ScrollView>
            </View>

            {/* Action Buttons (only if text exists) */}
            {extractedText && (
              <>
                <View style={styles.speakButtonContainer}>
                  <TouchableOpacity
                    onPress={speakText}
                    style={styles.speakButton}
                    activeOpacity={0.7}
                    disabled={isVoiceLoading}
                  >
                    {isVoiceLoading ? (
                      <ActivityIndicator size={20} color={isDark ? "#4CAF50" : "#fff"} />
                    ) : (
                      <Ionicons
                        name={isSpeaking ? "stop-circle" : "volume-high"}
                        size={20}
                        color={isDark ? "#4CAF50" : "#fff"}
                      />
                    )}
                    <Text style={styles.speakButtonText}>
                      {isVoiceLoading ? "Processing the text" : isSpeaking ? "Stop speaking" : "Speak the text"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowSpeakInfoModal(true)}
                    style={styles.speakInfoButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="information-circle"
                      size={24}
                      color={isDark ? "#FF6F00" : "#fff"}
                    />
                  </TouchableOpacity>
                </View>
                              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  onPress={copyToClipboard}
                  style={styles.copyButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="copy"
                    size={20}
                    color={isDark ? "#FF6F00" : "#fff"}
                  />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={shareText}
                  style={styles.shareButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="share"
                    size={20}
                    color={colors.shareBtnText}
                  />
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
              
              </>

            )}
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.loadingText}>Extracting text...</Text>
          </View>
        )}

        {/* Live Camera Detect Button */}
        <TouchableOpacity
          style={[
            styles.cameraBtn,
            (loading || isTextFoundOnImage) && styles.btnDisabled,
          ]}
          onPress={openLiveCamera}
          activeOpacity={0.8}
          disabled={loading || !device || isTextFoundOnImage}
        >
          <Entypo name="camera" size={22} color="#fff" />
          {isTextFoundOnImage ? (
            <Text style={styles.cameraBtnText}>Loading...</Text>
          ) : (
            <Text style={styles.cameraBtnText}>Live Camera Detect</Text>
          )}
        </TouchableOpacity>

        {/* Manual Capture Button */}
        <TouchableOpacity
          style={[styles.manualCameraBtn, loading && styles.btnDisabled]}
          onPress={openCamera}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Entypo name="camera" size={22} color={colors.textPrimary} />
          <Text style={styles.manualCameraBtnText}>Manual Capture</Text>
        </TouchableOpacity>

        {/* Gallery Button */}
        <TouchableOpacity
          style={[styles.galleryBtn, loading && styles.btnDisabled]}
          onPress={pickFromGallery}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Ionicons name="image" size={22} color={colors.textPrimary} />
          <Text style={styles.galleryBtnText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Image Preview Modal */}
      <Modal
        visible={showImageModal}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.imageModalContainer}>
          <View style={styles.imageModalHeader}>
            <Text style={styles.imageModalTitle}>Image Preview</Text>
            <TouchableOpacity
              style={styles.imageModalCloseBtn}
              onPress={() => setShowImageModal(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.imageModalContent}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal>

      {/* Full-Screen Text Modal */}
      <Modal
        visible={showTextModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowTextModal(false)}
      >
        <View
          style={[
            styles.container,
            {
              paddingTop:
                Platform.OS === "android" ? StatusBar.currentHeight : 0,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowTextModal(false)}
              style={styles.modalBackBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
            <Text style={styles.modalHeading}>Extracted Text</Text>
            <TouchableOpacity
              onPress={speakText}
              style={styles.modalSpeakBtn}
              activeOpacity={0.7}
              disabled={isVoiceLoading}
            >
              {isVoiceLoading ? (
                <ActivityIndicator size={20} color={colors.textPrimary} />
              ) : (
                <Ionicons
                  name={isSpeaking ? "stop-circle" : "volume-high"}
                  size={20}
                  color={colors.textPrimary}
                />
              )}
              <Text style={styles.modalSpeakBtnText}>
                {isVoiceLoading ? "Processing" : isSpeaking ? "Stop" : "Speak"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalTextScroll}
            contentContainerStyle={styles.modalTextContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.wordsContainer}>
              {extractedText.split(/\s+/).map((word, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => speakFromWord(index)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalText}>{word} </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Warning Modal */}
      <Modal
        visible={showWarningModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWarningModal(false)}
      >
        <View style={styles.warningModalOverlay}>
          <BlurView
            blurType={colors.blurType}
            blurAmount={10}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.warningModalBox}>
            {/* Title with Icon */}
            <View style={styles.warningTitleContainer}>
              <Ionicons name="warning" size={32} color={accent} />
              <Text style={styles.warningTitle}>Heavy Task Warning</Text>
            </View>

            {/* Description */}
            <Text style={styles.warningMessage}>
              Live Camera detection is a very heavy task and will give heavy
              load to your device, this may slow down low-end devices and
              eventually crash the app. If you are using low-end device,
              consider using Manual capture or from Gallery.
            </Text>

            {/* Tips */}
            <View style={styles.warningTipsContainer}>
              <Ionicons name="bulb" size={18} color={accent} />
              <Text style={styles.warningTips}>
                For high-end devices you can use the Live camera but for low-end
                devices don't use Live Camera.
              </Text>
            </View>

            {/* Don't Show Again Checkbox */}
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => handleDontShowAgain(!dontShowWarning)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  dontShowWarning && styles.checkboxChecked,
                ]}
              >
                {dontShowWarning && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Don't show again</Text>
            </TouchableOpacity>

            {/* Buttons */}
            <View style={styles.warningButtonsContainer}>
              <TouchableOpacity
                style={styles.warningLeaveBtn}
                onPress={() => setShowWarningModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.warningLeaveBtnText}>Leave</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.warningContinueBtn}
                onPress={() => {
                  setShowWarningModal(false);
                  startLiveCamera();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.warningContinueBtnText}>Continue Live</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Speak Info Modal */}
      <Modal
        visible={showSpeakInfoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpeakInfoModal(false)}
      >
        <View style={styles.speakInfoModalOverlay}>
          <BlurView
            blurType={colors.blurType}
            blurAmount={10}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.speakInfoModalBox}>
            {/* Header */}
            <View style={styles.speakInfoModalHeader}>
              <Text style={styles.speakInfoModalTitle}>Speak - How it works</Text>
              <TouchableOpacity
                onPress={() => setShowSpeakInfoModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Description */}
            <Text style={styles.speakInfoModalDesc}>
              Press the speak button and it will process the text and will start speaking. To start the voice from any custom point, press any word from the text and the voice will start from that word. To stop, press the stop button.
            </Text>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.speakInfoCloseBtn}
              onPress={() => setShowSpeakInfoModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.speakInfoCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors, accent, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Platform.OS === "android" ? StatusBar.currentHeight + 16 : 60,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    backBtn: {
      marginRight: 12,
    },
    heading: {
      fontSize: 28,
      fontWeight: "bold",
      color: colors.textPrimary,
      flex: 1,
    },
    clearBtn: {
      backgroundColor: isDark ? "#2a2a2a" : "#e8e8e8",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
    },
    clearBtnText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 100,
    },

    // Empty State
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.textTertiary,
      marginTop: 20,
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
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
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    imagePreviewContainer: {
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: isDark ? "#2a2a2a" : "#f5f5f5",
      borderWidth: 1,
      borderColor: isDark ? "#3a3a3a" : "#e0e0e0",
    },
    imagePreview: {
      width: "100%",
      height: 250,
      resizeMode: "contain",
    },

    // Text Section
    textSection: {
      marginBottom: 20,
    },
    textContainer: {
      backgroundColor: isDark ? "#2a2a2a" : "#f5f5f5",
      borderRadius: 16,
      padding: 16,
      minHeight: 200,
      maxHeight: 300,
      borderWidth: 1,
      borderColor: isDark ? "#3a3a3a" : "#e0e0e0",
      marginBottom: 12,
      position: "relative",
    },
    expandBtn: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.75)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },
    textScroll: {
      flex: 1,
      paddingRight: 48,
    },
    wordsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    extractedText: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 26,
    },
    noTextDetected: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 26,
      fontStyle: "italic",
      textAlign: "center",
      paddingVertical: 40,
    },
    actionButtonsContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 12,
    },
    copyButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 16,
      backgroundColor: isDark ? "#fff" : "#FF6F00",
      borderRadius: 42,
    },
    copyButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: isDark ? "#FF6F00" : "#fff",
    },
    speakButtonContainer: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    speakButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 16,
      backgroundColor: isDark ? "#fff" : "#4CAF50",
      borderRadius: 42,
    },
    speakButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: isDark ? "#4CAF50" : "#fff",
    },
    speakInfoButton: {
      width: "20%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 15,
      backgroundColor: isDark ? "#fff" : "#FF6F00",
      borderRadius: 42,
    },
    shareButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 16,
      backgroundColor: colors.shareBtnBg,
      borderRadius: 42,
    },
    shareButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.shareBtnText,
    },

    // Loading
    loadingContainer: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 12,
    },
    loadingText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "600",
    },

    // Camera Button
    cameraBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: accent,
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 20,
      gap: 10,
    },
    cameraBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },

    // Manual Camera Button
    manualCameraBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#2a2a2a" : "#e8e8e8",
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 12,
      gap: 10,
    },
    manualCameraBtnText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },

    // Gallery Button
    galleryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#2a2a2a" : "#e8e8e8",
      borderRadius: 60,
      paddingVertical: 16,
      marginTop: 12,
      gap: 10,
    },
    galleryBtnText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },

    btnDisabled: {
      opacity: 0.6,
    },

    // Camera View
    cameraContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    cameraOverlay: {
      flex: 1,
      backgroundColor: "transparent",
    },
    cameraHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 16 : 60,
      paddingBottom: 20,
      gap: 16,
    },
    cameraCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    cameraTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: "#fff",
    },
    scanningIndicator: {
      position: "absolute",
      top: Platform.OS === "android" ? StatusBar.currentHeight + 120 : 160,
      alignSelf: "center",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 25,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    scanningText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "600",
    },
    guideFrame: {
      position: "absolute",
      top: "30%",
      alignSelf: "center",
      width: "80%",
      height: 200,
      borderWidth: 2,
      borderColor: accent,
      borderRadius: 16,
      backgroundColor: "transparent",
    },

    // Modals
    imageModalContainer: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    imageModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 16 : 60,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#2a2a2a" : "#e0e0e0",
    },
    imageModalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    imageModalCloseBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    imageModalContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#1a1a1a" : "#f5f5f5",
    },
    modalImage: {
      width: "100%",
      height: "100%",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#2a2a2a" : "#e0e0e0",
    },
    modalBackBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    modalHeading: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    modalSpeakBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: isDark ? "#3a3a3a" : "#e0e0e0",
      borderRadius: 50,
    },
    modalSpeakBtnText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    modalTextScroll: {
      flex: 1,
      paddingBottom: 50,
    },
    modalTextContent: {
      padding: 20,
      paddingBottom: 100,
    },
    modalText: {
      fontSize: 16,
      color: colors.textPrimary,
      lineHeight: 28,
    },

    // Warning Modal - Bottom Sheet Style
    warningModalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    warningModalBox: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 32,
    },
    warningTitleContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    },
    warningTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    warningMessage: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 23,
      marginBottom: 16,
      textAlign: "left",
    },
    warningTipsContainer: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: isDark ? "#2a2a2a" : "#fff3e0",
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    warningTips: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    checkboxContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 24,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.textSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: accent,
      borderColor: accent,
    },
    checkboxLabel: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: "500",
    },
    warningButtonsContainer: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
      marginBottom: 50,
    },
    warningLeaveBtn: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 60,
      backgroundColor: isDark ? "#2a2a2a" : "#f0f0f0",
      borderWidth: 1,
      borderColor: isDark ? "#3a3a3a" : "#e0e0e0",
      alignItems: "center",
    },
    warningLeaveBtnText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    warningContinueBtn: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 60,
      backgroundColor: accent,
      alignItems: "center",
    },
    warningContinueBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },

    // Speak Info Modal
    speakInfoModalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    speakInfoModalBox: {
      backgroundColor: colors.modalBg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 30,
      maxHeight: "50%",
    },
    speakInfoModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    speakInfoModalTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    speakInfoModalDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 24,
    },
    speakInfoCloseBtn: {
      backgroundColor: "#FF6F00",
      paddingVertical: 14,
      borderRadius: 60,
      alignItems: "center",
      marginBottom:40
    },
    speakInfoCloseBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },
  });

export default CameraToText;
