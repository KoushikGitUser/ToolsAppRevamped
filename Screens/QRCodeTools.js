import { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Share,
  Linking,
  Dimensions,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../Services/ThemeContext';
import QRCode from 'react-native-qrcode-svg';
import { Camera, CameraType } from 'react-native-camera-kit';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { triggerToast } from '../Services/toast';
import Toaster from "../Components/UniversalToaster/Toaster";

const ACCENT = '#6B8E23';
const ACCENT_LIGHT = '#7FA52E';

const QRCodeTools = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const [showInputModal, setShowInputModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [inputText, setInputText] = useState('');
  const [generatedQR, setGeneratedQR] = useState('');
  const [scannedData, setScannedData] = useState('');
  const [showLimitError, setShowLimitError] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  const cameraRef = useRef(null);

  const openGenerateModal = () => {
    setInputText('');
    setShowLimitError(false);
    setShowInputModal(true);
  };

  const handleTextChange = (text) => {
    setInputText(text);
    if (text.length >= 500) {
      setShowLimitError(true);
    } else {
      setShowLimitError(false);
    }
  };

  const getQRSize = (text) => {
    const charCount = text.length;
    const screenWidth = Dimensions.get('window').width;

    if (charCount <= 20) {
      return 200; // Current size
    } else if (charCount <= 40) {
      return screenWidth * 0.7; // 70% of screen width
    } else {
      return screenWidth * 0.8; // 90% of screen width
    }
  };

  const generateQRCode = async () => {
    if (!inputText.trim()) {
      triggerToast('Empty', 'Please enter some text', 'alert', 2000);
      return;
    }

    setIsGenerating(true);
    setShowInputModal(false);
    setShowQRModal(true);

    // Small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 300));

    setGeneratedQR(inputText);
    setIsGenerating(false);
  };

const openScanner = async () => {
  try {
    // Check current permission
    const { status } = await ImagePicker.getCameraPermissionsAsync();

    if (status === 'granted') {
      setShowScanner(true);
      return;
    }

    // Request permission
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.status === 'granted') {
      setShowScanner(true);
    } else {
      Alert.alert(
        "Camera Permission Required",
        "Please enable camera permission in settings to scan QR codes.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
    }
  } catch (error) {
    console.error("Permission error:", error);
    triggerToast('Error', 'Unable to access camera permission', 'alert', 2000);
  }
};

  const handleBarcodeScan = (event) => { 
    if (event.nativeEvent.codeStringValue) {
      setScannedData(event.nativeEvent.codeStringValue);
      setShowScanner(false);
      setShowResultModal(true);
    }
  };

  const isURL = (text) => {
    const urlPattern = /^(https?:\/\/)|(www\.)/i;
    return urlPattern.test(text);
  };

  const openURL = async () => {
    let url = scannedData;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      triggerToast('Error', 'Cannot open this URL', 'alert', 2000);
    }
  };

  const copyToClipboard = async (text) => {
    await Clipboard.setStringAsync(text);
    triggerToast('Copied', 'Copied to clipboard', 'success', 2000);
  };

  const shareText = async (text) => {
    try {
      await Share.share({ message: text });
    } catch (error) {
      console.error('Share Error:', error);
    }
  };

  const speakFromWord = async (wordIndex) => {
    if (!scannedData) return;

    const words = scannedData.split(/\s+/);
    const textToSpeak = words.slice(wordIndex).join(' ');

    // Stop any existing speech
    await Speech.stop();

    // Small delay to ensure stop completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Set state after stop completes
    setIsSpeaking(true);
    setCurrentWordIndex(wordIndex);

    Speech.speak(textToSpeak, {
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
        triggerToast('Error', 'Failed to speak text', 'alert', 2000);
      },
    });
  };

  const speakText = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakFromWord(0);
    }
  };

  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
    setCurrentWordIndex(-1);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>QR Code Tools</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        <View style={styles.emptyState}>
          <Ionicons name="qr-code" size={64} color={colors.emptyIcon} />
          <Text style={styles.emptyTitle}>QR Code Tools</Text>
          <Text style={styles.emptyDesc}>
            Generate and scan QR codes with ease
          </Text>
        </View>

        {/* Generate QR Code Button */}
        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.8}
          onPress={openGenerateModal}
        >
          <Ionicons name="qr-code" size={22} color="#fff" />
          <Text style={styles.actionButtonText}>Generate QR Code</Text>
        </TouchableOpacity>

        {/* Scan QR Code Button */}
        <TouchableOpacity
          style={styles.scanButton}
          activeOpacity={0.8}
          onPress={openScanner}
        >
          <MaterialCommunityIcons name="qrcode-scan" size={22} color={colors.textPrimary} />
          <Text style={styles.scanButtonText}>Scan QR Code</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Input Modal for Generate */}
      <Modal
        visible={showInputModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInputModal(false)}
      >
        <Toaster/>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
              <TouchableWithoutFeedback>
                <View style={styles.inputModalBox}>
                  <Text style={styles.inputModalTitle}>Generate QR Code</Text>

                  <TextInput
                    style={styles.textInput}
                    placeholder="Your text"
                    placeholderTextColor={colors.textSecondary}
                    value={inputText}
                    onChangeText={handleTextChange}
                    multiline
                    maxLength={500}
                  />

                  {showLimitError && (
                    <Text style={styles.errorText}>Character limit reached (500 max)</Text>
                  )}

                  <View style={styles.inputModalButtons}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setShowInputModal(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.generateButton}
                      onPress={generateQRCode}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.generateButtonText}>Generate</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Code Display Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <View style={styles.qrModalBox}>
            <Text style={styles.qrModalTitle}>Generated QR Code</Text>

            {isGenerating ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={styles.loaderText}>Generating QR Code...</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center' }}
              >
                <View style={styles.qrContainer}>
                  {generatedQR && (
                    <QRCode
                      value={generatedQR}
                      size={getQRSize(generatedQR)}
                      color={accent}
                      backgroundColor="#ffffff"
                      quietZone={10}
                    />
                  )}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowQRModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanner */}
      {showScanner && (
        <Modal
          visible={showScanner}
          animationType="slide"
          onRequestClose={() => setShowScanner(false)}
        >
          <View style={styles.scannerContainer}>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              scanBarcode
              onReadCode={handleBarcodeScan}
              showFrame={false}
            />

            {/* Scanner Frame Overlay */}
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerHeader}>
                <TouchableOpacity
                  onPress={() => setShowScanner(false)}
                  style={styles.scannerCloseBtn}
                >
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.scannerTitle}>Scan QR Code</Text>
              </View>

              <View style={styles.scanFrameContainer}>
                <View style={styles.scanFrame} />
              </View>

              <Text style={styles.scannerHint}>
                Point camera at QR code
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Scanned Result Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          stopSpeaking();
          setShowResultModal(false);
        }}
      >
        <Toaster/>
        <View style={styles.modalOverlay}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <View style={styles.resultModalBox}>
            <Text style={styles.resultModalTitle}>Scanned Result</Text>

            <View style={styles.resultTextWrapper}>
              <ScrollView
                style={styles.resultTextScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {isURL(scannedData) ? (
                  <Text style={styles.resultText} selectable>{scannedData}</Text>
                ) : (
                  <View style={styles.wordsContainer}>
                    {scannedData.split(/\s+/).filter(word => word.trim().length > 0).map((word, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => speakFromWord(index)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.resultText}>
                          {word}{' '}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>

            <View style={styles.resultButtons}>
              <TouchableOpacity
                onPress={() => copyToClipboard(scannedData)}
                style={styles.copyButton}
                activeOpacity={0.7}
              >
                <Ionicons name="copy" size={20} color={isDark ? '#FF6F00' : '#fff'} />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>

              {!isURL(scannedData) && (
                <TouchableOpacity
                  onPress={speakText}
                  style={styles.speakButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isSpeaking ? "stop-circle" : "volume-high"}
                    size={20}
                    color={isDark ? '#4CAF50' : '#fff'}
                  />
                  <Text style={styles.speakButtonText}>{isSpeaking ? 'Stop' : 'Speak'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => shareText(scannedData)}
                style={styles.shareButton}
                activeOpacity={0.7}
              >
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
            </View>

            {isURL(scannedData) && (
              <TouchableOpacity
                style={styles.openUrlButton}
                onPress={openURL}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={20} color="#fff" />
                <Text style={styles.openUrlButtonText}>Open URL</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                stopSpeaking();
                setShowResultModal(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const { width } = Dimensions.get('window');

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
    padding: 20,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 20,
    gap: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 12,
    gap: 10,
  },
  scanButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Modal Overlay
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  // Input Modal
  inputModalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
  },
  inputModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    marginBottom: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginBottom: 12,
    marginLeft: 4,
  },
  inputModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 60,
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  generateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 60,
    backgroundColor: accent,
    alignItems: 'center',
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // QR Display Modal
  qrModalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
    alignItems: 'center',
  },
  qrModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 40,
    marginBottom: 70,
    borderWidth: 10,
    borderColor: accent,
  },
  loaderContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  qrText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  closeButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 60,
    backgroundColor: accent,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Scanner
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 20 : 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  scannerCloseBtn: {
    marginRight: 12,
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  scanFrameContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: accent,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 60,
    fontWeight: '600',
  },

  // Result Modal
  resultModalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
    maxHeight: '70%',
  },
  resultModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  resultTextWrapper: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    maxHeight: 200,
  },
  resultTextScroll: {
    maxHeight: 170,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resultText: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    backgroundColor: isDark ? '#fff' : '#FF6F00',
    borderRadius: 42,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: isDark ? '#FF6F00' : '#fff',
  },
  speakButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    backgroundColor: isDark ? '#fff' : '#4CAF50',
    borderRadius: 42,
  },
  speakButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: isDark ? '#4CAF50' : '#fff',
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    backgroundColor: colors.shareBtnBg,
    borderRadius: 42,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.shareBtnText,
  },
  openUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 60,
    backgroundColor: accent,
    marginBottom: 12,
  },
  openUrlButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  doneButton: {
    paddingVertical: 16,
    borderRadius: 60,
    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    borderWidth: 1,
    borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
    alignItems: 'center',
    marginBottom: 20,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export default QRCodeTools;
