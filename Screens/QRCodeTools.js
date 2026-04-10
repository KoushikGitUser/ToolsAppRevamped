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
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../Services/ThemeContext';
import QRCode from 'react-native-qrcode-svg';
import { Camera, CameraType } from 'react-native-camera-kit';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { triggerToast } from '../Services/toast';
import { scanQRFromImage } from '../modules/pdf-tools';
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
  const [showScanChoiceModal, setShowScanChoiceModal] = useState(false);

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
    // Max size = screen width minus container padding (40) and quiet zone (20)
    const maxSize = screenWidth - 100;

    if (charCount <= 20) {
      return Math.min(200, maxSize);
    } else if (charCount <= 40) {
      return Math.min(screenWidth * 0.60, maxSize);
    } else {
      return maxSize;
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

  const scanFromImage = async () => {
    try {
      // Check current permission
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        // Request permission
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permissionResult.status !== 'granted') {
          Alert.alert(
            "Gallery Permission Required",
            "Please enable gallery permission in settings to scan QR from images.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      const imageUri = result.assets[0].uri;
      try {
        const qrResult = await scanQRFromImage(imageUri);
        if (qrResult?.text) {
          setScannedData(qrResult.text);
          setShowResultModal(true);
        }
      } catch (e) {
        if (e?.code === 'ERR_NO_QR') {
          triggerToast('No QR Found', 'No QR code or barcode detected in this image', 'alert', 3000);
        } else {
          triggerToast('Error', 'Failed to scan image for QR code', 'error', 3000);
        }
      }
    } catch (error) {
      console.log('Scan from image error:', error);
      triggerToast('Error', 'Failed to pick image', 'error', 2000);
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

  const isUPI = (text) => {
    return text?.toLowerCase().startsWith('upi://');
  };

  const parseUPI = (upiUri) => {
    try {
      const queryString = upiUri.split('?')[1];
      if (!queryString) return null;
      const params = {};
      queryString.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      });
      return {
        payeeId: params.pa || '',
        payeeName: params.pn || '',
        amount: params.am || '',
        currency: params.cu || 'INR',
        note: params.tn || '',
      };
    } catch {
      return null;
    }
  };

  const openUPI = async () => {
    try {
      const supported = await Linking.canOpenURL(scannedData);
      if (supported) {
        await Linking.openURL(scannedData);
      } else {
        triggerToast('No UPI App', 'No UPI payment app found on this device', 'alert', 3000);
      }
    } catch {
      triggerToast('Error', 'Could not open UPI app', 'error', 2000);
    }
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
          onPress={() => setShowScanChoiceModal(true)}
        >
          <MaterialCommunityIcons name="qrcode-scan" size={22} color={colors.textPrimary} />
          <Text style={styles.scanButtonText}>Scan QR Code</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Scan Choice Modal */}
      <Modal
        visible={showScanChoiceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScanChoiceModal(false)}
      >
        <Pressable style={styles.scanChoiceOverlay} onPress={() => setShowScanChoiceModal(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <View style={styles.scanChoiceBox}>
            <Text style={styles.scanChoiceTitle}>Scan QR Code</Text>
            <Text style={styles.scanChoiceDesc}>Choose how you want to scan</Text>

            <TouchableOpacity
              style={styles.scanChoiceBtn}
              activeOpacity={0.8}
              onPress={() => {
                setShowScanChoiceModal(false);
                openScanner();
              }}
            >
              <Ionicons name="camera" size={24} color={accent} />
              <View style={styles.scanChoiceBtnText}>
                <Text style={styles.scanChoiceBtnTitle}>Camera</Text>
                <Text style={styles.scanChoiceBtnDesc}>Scan QR code using camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scanChoiceBtn}
              activeOpacity={0.8}
              onPress={() => {
                setShowScanChoiceModal(false);
                scanFromImage();
              }}
            >
              <Ionicons name="image" size={24} color={accent} />
              <View style={styles.scanChoiceBtnText}>
                <Text style={styles.scanChoiceBtnTitle}>Image from Gallery</Text>
                <Text style={styles.scanChoiceBtnDesc}>Detect QR code from an image</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scanChoiceCancelBtn}
              onPress={() => setShowScanChoiceModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.scanChoiceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
            <Text style={styles.resultModalTitle}>
              {isUPI(scannedData) ? 'UPI QR Detected' : 'Scanned Result'}
            </Text>

            {/* UPI Payment Details */}
            {isUPI(scannedData) && (() => {
              const upi = parseUPI(scannedData);
              if (!upi) return null;
              return (
                <View style={styles.upiCard}>
                  <View style={styles.upiIconRow}>
                    <FontAwesome name="bank" size={32} color={accent} />
                  </View>
                  {upi.payeeName ? (
                    <View style={styles.upiRow}>
                      <Text style={styles.upiLabel}>Pay to</Text>
                      <Text style={styles.upiValue}>{upi.payeeName}</Text>
                    </View>
                  ) : null}
                  {upi.payeeId ? (
                    <View style={styles.upiRow}>
                      <Text style={styles.upiLabel}>UPI ID</Text>
                      <Text style={styles.upiValue}>{upi.payeeId}</Text>
                    </View>
                  ) : null}
                  {upi.amount ? (
                    <View style={styles.upiRow}>
                      <Text style={styles.upiLabel}>Amount</Text>
                      <Text style={[styles.upiValue, styles.upiAmount]}>₹{upi.amount}</Text>
                    </View>
                  ) : null}
                  {upi.note ? (
                    <View style={styles.upiRow}>
                      <Text style={styles.upiLabel}>Note</Text>
                      <Text style={styles.upiValue}>{upi.note}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.upiPayBtn}
                    onPress={openUPI}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="currency-rupee" size={24} color="white" />
                    <Text style={styles.upiPayBtnText}>Pay Now</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Normal text / URL result */}
            {!isUPI(scannedData) && (
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
            )}

            <View style={styles.resultButtons}>
              <TouchableOpacity
                onPress={() => copyToClipboard(scannedData)}
                style={styles.copyButton}
                activeOpacity={0.7}
              >
                <Ionicons name="copy" size={20} color={isDark ? '#FF6F00' : '#fff'} />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>

              {!isURL(scannedData) && !isUPI(scannedData) && (
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
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 40,
    marginBottom: 70,
    borderWidth: 10,
    borderColor: accent,
    maxWidth: Dimensions.get('window').width - 50,
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
  // Scan Choice Modal
  scanChoiceOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanChoiceBox: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    width: '85%',
  },
  scanChoiceTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  scanChoiceDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  scanChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  scanChoiceBtnText: {
    flex: 1,
  },
  scanChoiceBtnTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scanChoiceBtnDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scanChoiceCancelBtn: {
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: 6,
  },
  scanChoiceCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // UPI Payment Card
  upiCard: {
    backgroundColor: isDark ? '#1a2a1a' : '#f0fdf0',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isDark ? '#2d4a2d' : '#c8e6c9',
    padding: 20,
    marginBottom: 16,
  },
  upiIconRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  upiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2a3a2a' : '#e8f5e9',
  },
  upiLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  upiValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  upiAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4CAF50',
  },
  upiPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 50,
    paddingVertical: 16,
    marginTop: 20,
    gap: 3,
  },
  upiPayBtnText: {
    fontSize: 17,
    fontWeight: '800',
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
