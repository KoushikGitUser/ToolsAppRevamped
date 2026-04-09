import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
  PermissionsAndroid,
  Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from '@react-native-community/blur';
import { triggerToast } from '../Services/toast';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { saveToDownloads } from '../modules/zip-tools';
import { useTheme } from '../Services/ThemeContext';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { trim } from 'react-native-video-trim';
import Slider from '@react-native-community/slider';
import { amplifyAudio, fadeAudio } from '../modules/audio-extractor';

const ACCENT = '#FF0000';
const ACCENT_LIGHT = '#FF0000';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HANDLE_WIDTH = 20;
const SCROLL_PADDING = 40; // 20px on each side
const CONTAINER_WIDTH = SCREEN_WIDTH - SCROLL_PADDING;
const WAVEFORM_WIDTH = CONTAINER_WIDTH - (HANDLE_WIDTH * 2); // Container width minus handles

const AudioTrimmer = ({ navigation }) => {
  const [audio, setAudio] = useState(null);
  const [trimmedUri, setTrimmedUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(100);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformHeights, setWaveformHeights] = useState([]);
  const [isAdjusting, setIsAdjusting] = useState(false); // Track if user is adjusting trim
  const [audioName, setAudioName] = useState(''); // Audio name
  const [tempAudioName, setTempAudioName] = useState(''); // Temp name for modal input
  const [renameModalVisible, setRenameModalVisible] = useState(false); // Rename modal
  const [audioFormat, setAudioFormat] = useState('m4a'); // Audio format (m4a or wav)
  const [formatModalVisible, setFormatModalVisible] = useState(false); // Format modal
  const [saving, setSaving] = useState(false);
  const [adjustVolume, setAdjustVolume] = useState(false);
  const [volume, setVolume] = useState(100);
  const [volumeSlider, setVolumeSlider] = useState(100);
  const volumeToggleAnim = useRef(new Animated.Value(0)).current;
  const [applyFade, setApplyFade] = useState(false);
  const [fadeTarget, setFadeTarget] = useState('both'); // 'start', 'end', 'both'
  const [fadeInDuration, setFadeInDuration] = useState(1);
  const [fadeOutDuration, setFadeOutDuration] = useState(1);
  const fadeToggleAnim = useRef(new Animated.Value(0)).current;

  const { colors, isDark } = useTheme();
  const accent = isDark ? ACCENT : ACCENT_LIGHT;
  const styles = useMemo(() => createStyles(colors, accent, isDark), [colors, accent, isDark]);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    if (status.duration > 0 && duration === 0) {
      setDuration(status.duration);
      setEndTime(status.duration);

      // Generate waveform heights once
      const heights = Array.from({ length: 50 }, () => Math.random() * 60 + 20);
      setWaveformHeights(heights);
    }
  }, [status.duration]);

  useEffect(() => {
    if (status.playing) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [status.playing]);

  // Auto-pause when reaching end time during playback
  useEffect(() => {
    if (status.playing && status.currentTime >= endTime) {
      player.pause();
      player.seekTo(startTime);
    }
  }, [status.currentTime, endTime, status.playing]);

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];

      // Reset states
      setAudio({ uri: asset.uri, name: asset.name });
      setTrimmedUri(null);
      setStartTime(0);
      setEndTime(100);
      setDuration(0);
      setIsPlaying(false);
      setAdjustVolume(false);
      setVolume(100);
      setVolumeSlider(100);
      volumeToggleAnim.setValue(0);
      setApplyFade(false);
      setFadeTarget('both');
      setFadeInDuration(1);
      setFadeOutDuration(1);
      fadeToggleAnim.setValue(0);
      // Load audio for playback
      try {
        player.replace({ uri: asset.uri });
      } catch (e) {
        console.log('Audio load error:', e);
      }

      triggerToast('Audio Selected', 'Audio file loaded successfully', 'success', 2000);
    }
  };

  const togglePlayback = () => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        // Start from startTime if not already playing
        if (status.currentTime < startTime || status.currentTime >= endTime) {
          player.seekTo(startTime);
        }
        player.play();
      }
    } catch (e) {
      console.log('Playback error:', e);
      triggerToast('Error', 'Failed to play audio.', 'error', 3000);
    }
  };

  const trimAudio = async () => {
    if (!audio || !duration) return;

    setLoading(true);
    try {
      // Trim the audio using react-native-video-trim
      const result = await trim(audio.uri, {
        startTime: startTime * 1000, // Convert to milliseconds
        endTime: endTime * 1000, // Convert to milliseconds
        quality: 'high',
        saveToCameraRoll: false,
        saveWithCurrentDate: false,
      });

      console.log('Trimmed audio result:', result);

      // Extract the outputPath from the result object
      const trimmedPath = result.outputPath;
      console.log('Trimmed audio path (mp4):', trimmedPath);

      // Create proper file URI for the trimmed mp4
      const mp4Uri = `file://${trimmedPath}`;

      // Copy the trimmed mp4 to a new file with .m4a extension (proper audio format)
      const audioFileName = `Trimmed_Audio_ToolsApp_temp.m4a`;

      // Get the cache directory path properly
      const cacheDir = trimmedPath.substring(0, trimmedPath.lastIndexOf('/'));
      const audioPath = `${cacheDir}/${audioFileName}`;
      const audioUri = `file://${audioPath}`;

      console.log('Cache directory:', cacheDir);
      console.log('Copying to audio format (.m4a):', audioPath);

      // Copy the mp4 file to m4a (same format, just different extension)
      const sourceFile = new File(mp4Uri);
      const destFile = new File(audioUri);

      if (destFile.exists) {
        destFile.delete();
      }

      sourceFile.copy(destFile);

      console.log('M4A file created:', audioUri);

      let finalUri = audioUri;

      // If volume or fade is enabled, output is always WAV
      if (adjustVolume || applyFade) {
        const gain = adjustVolume ? volume / 100 : 1.0;
        const wavPath = `${cacheDir}/ToolsApp_processed_${Date.now()}.wav`;
        if (applyFade) {
          const inDur = (fadeTarget === 'start' || fadeTarget === 'both') ? fadeInDuration : 0;
          const outDur = (fadeTarget === 'end' || fadeTarget === 'both') ? fadeOutDuration : 0;
          const result = await fadeAudio(audioPath, wavPath, gain, inDur, outDur);
          finalUri = `file://${result.path}`;
        } else {
          const result = await amplifyAudio(audioPath, wavPath, gain);
          finalUri = `file://${result.path}`;
        }
        console.log('Output (WAV):', finalUri);
      } else if (audioFormat === 'wav') {
        // User selected WAV but no volume change - decode to WAV anyway
        const gain = 1.0;
        const wavPath = `${cacheDir}/ToolsApp_output_${Date.now()}.wav`;
        const wavResult = await amplifyAudio(
          audioPath,
          wavPath,
          gain
        );
        finalUri = `file://${wavResult.path}`;
        console.log('Converted to WAV:', finalUri);
      } else {
        // Keep as M4A - rename if custom name provided
        if (audioName) {
          const m4aFileName = `${audioName}.m4a`;
          const m4aPath = `${cacheDir}/${m4aFileName}`;
          const m4aUri = `file://${m4aPath}`;

          const m4aFinalFile = new File(m4aUri);

          if (m4aFinalFile.exists) {
            m4aFinalFile.delete();
          }

          destFile.copy(m4aFinalFile);
          finalUri = m4aUri;
        }
      }

      // Store the final file path
      setTrimmedUri(finalUri);

      triggerToast('Success', 'Audio trimmed successfully!', 'success', 2500);
    } catch (error) {
      console.log('Audio trimming error:', error);
      triggerToast('Error', 'Failed to trim audio. Please try again.', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const shareAudio = async () => {
    if (!trimmedUri) return;
    try {
      console.log('Sharing trimmed audio from:', trimmedUri);

      // Check if file exists first
      const file = new File(trimmedUri);
      console.log('File exists before sharing:', file.exists);
      console.log('File size before sharing:', file.size);

      // Try sharing with different MIME types
      await Sharing.shareAsync(trimmedUri, {
        mimeType: 'audio/*',
        dialogTitle: 'Save Trimmed Audio',
      });
    } catch (error) {
      console.log('Share error:', error);
      triggerToast('Error', 'Failed to share audio.', 'error', 3000);
    }
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

  const saveAudio = async () => {
    if (!trimmedUri) return;
    setSaving(true);
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        triggerToast('Error', 'Storage permission is required to save files', 'error', 3000);
        return;
      }
      const filePath = trimmedUri.replace(/^file:\/\//, '');
      const isWav = filePath.endsWith('.wav');
      const ext = isWav ? 'wav' : 'm4a';
      const mime = isWav ? 'audio/wav' : 'audio/mp4';
      const fileName = audioName.trim() ? `${audioName.trim()}.${ext}` : `ToolsApp_Trimmed_${Date.now()}.${ext}`;
      await saveToDownloads(filePath, fileName, mime);
      triggerToast('Success', 'Saved to Downloads', 'success', 2500);
    } catch (e) {
      triggerToast('Error', e?.message || 'Failed to save', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10); // Get deciseconds (tenths of a second)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Pan responder for start handle
  const startPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !loading,
        onMoveShouldSetPanResponder: () => !loading,
        onPanResponderGrant: () => {
          if (status.playing) {
            player.pause();
          }
          setIsAdjusting(true);
        },
        onPanResponderMove: (evt) => {
          const touchX = evt.nativeEvent.pageX;
          const relativeX = touchX - HANDLE_WIDTH; // Offset for the handle itself
          const newPosition = Math.max(0, Math.min(relativeX, WAVEFORM_WIDTH));
          const newTime = (newPosition / WAVEFORM_WIDTH) * duration;

          if (newTime < endTime - 1) {
            // Minimum 1 second gap
            setStartTime(newTime);
          }
        },
        onPanResponderRelease: () => {
          setIsAdjusting(false);
          player.seekTo(startTime);
        },
      }),
    [duration, endTime, status.playing, loading]
  );

  // Pan responder for end handle
  const endPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !loading,
        onMoveShouldSetPanResponder: () => !loading,
        onPanResponderGrant: () => {
          if (status.playing) {
            player.pause();
          }
          setIsAdjusting(true);
        },
        onPanResponderMove: (evt) => {
          const touchX = evt.nativeEvent.pageX;
          const relativeX = touchX - HANDLE_WIDTH; // Offset for the handle itself
          const newPosition = Math.max(0, Math.min(relativeX, WAVEFORM_WIDTH));
          const newTime = (newPosition / WAVEFORM_WIDTH) * duration;

          if (newTime > startTime + 1) {
            // Minimum 1 second gap
            setEndTime(newTime);
          }
        },
        onPanResponderRelease: () => {
          setIsAdjusting(false);
          player.seekTo(startTime);
        },
      }),
    [duration, startTime, status.playing, loading]
  );

  const startPosition = duration > 0 ? HANDLE_WIDTH + (startTime / duration) * WAVEFORM_WIDTH : HANDLE_WIDTH;
  const endPosition = duration > 0 ? HANDLE_WIDTH + (endTime / duration) * WAVEFORM_WIDTH : HANDLE_WIDTH + WAVEFORM_WIDTH;
  const trimmedDuration = endTime - startTime;
  const currentProgress = duration > 0 ? HANDLE_WIDTH + ((status.currentTime || 0) / duration) * WAVEFORM_WIDTH : HANDLE_WIDTH;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Audio Trimmer</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Empty State */}
        {!audio && (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes" size={64} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>No audio selected</Text>
            <Text style={styles.emptyDesc}>
              Pick an audio file to trim it
            </Text>
          </View>
        )}

        {/* Audio Info Card */}
        {audio && (
          <View style={styles.audioCard}>
            <View style={styles.audioTopRow}>
              <View style={styles.audioIconCircle}>
                <Ionicons name="musical-notes" size={28} color={accent} />
              </View>
              <View style={styles.audioInfo}>
                <Text style={styles.audioName} numberOfLines={1}>
                  {audio.name}
                </Text>
                <Text style={styles.audioDuration}>
                  {duration > 0 ? formatTime(duration) : 'Loading...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={togglePlayback}
                activeOpacity={0.7}
                disabled={!duration || loading}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={24}
                  color="#fff"
                  style={{marginLeft:1}}
                />
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            {duration > 0 && (
              <>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: isAdjusting
                          ? '0%'
                          : `${Math.min(100, Math.max(0, ((status.currentTime - startTime) / (endTime - startTime)) * 100))}%`
                      }
                    ]}
                  />
                </View>
                <View style={styles.progressTimeRow}>
                  <Text style={styles.progressTime}>
                    {isAdjusting ? formatTime(startTime) : formatTime(Math.max(startTime, Math.min(status.currentTime || 0, endTime)))}
                  </Text>
                  <Text style={styles.progressTime}>{formatTime(endTime)}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Pick Audio Button - shown when no audio */}
        {!audio && (
          <TouchableOpacity style={styles.pickBtn} onPress={pickAudio} activeOpacity={0.8}>
            <Ionicons name="musical-notes" size={22} color={colors.textPrimary} />
            <Text style={styles.pickBtnText}>Pick Audio</Text>
          </TouchableOpacity>
        )}

        {/* Waveform and Trim Controls */}
        {audio && duration > 0 && !trimmedUri && (
          <View style={styles.trimSection}>


            {/* Time Display */}
            <View style={styles.timeDisplay}>
              <View style={styles.timeItem}>
                <Text style={styles.timeLabel}>Start</Text>
                <Text style={styles.timeValue}>{formatTime(startTime)}</Text>
              </View>
              <View style={styles.timeItem}>
                <Text style={styles.timeLabel}>Duration</Text>
                <Text style={[styles.timeValue, { color: accent }]}>{formatTime(trimmedDuration)}</Text>
              </View>
              <View style={styles.timeItem}>
                <Text style={styles.timeLabel}>End</Text>
                <Text style={styles.timeValue}>{formatTime(endTime)}</Text>
              </View>
            </View>

            {/* Waveform Container */}
            <View style={styles.waveformContainer}>
              {/* Waveform Background */}
              <TouchableWithoutFeedback
                onPress={(evt) => {
                  if (loading) return;

                  // Get the touch position relative to the screen
                  const touchX = evt.nativeEvent.pageX;

                  // Calculate position relative to waveform (accounting for padding)
                  const relativeX = touchX - 20 - HANDLE_WIDTH; // 20 is screen padding

                  // Calculate the time position based on touch
                  const seekPosition = Math.max(0, Math.min(relativeX / WAVEFORM_WIDTH, 1)) * duration;

                  // Only seek if touch is within the trimmed range
                  if (seekPosition >= startTime && seekPosition <= endTime) {
                    player.seekTo(seekPosition);
                  }
                }}
              >
                <View style={styles.waveformBg}>
                  {/* Generate waveform bars */}
                  {waveformHeights.map((height, i) => {
                    const barPosition = HANDLE_WIDTH + (i / 50) * WAVEFORM_WIDTH;
                    const isInRange = barPosition >= startPosition && barPosition <= endPosition;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.waveformBar,
                          {
                            height,
                            backgroundColor: isInRange ? accent + '80' : colors.border2,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </TouchableWithoutFeedback>

              {/* Progress Indicator */}
              {isPlaying && (
                <View
                  style={[
                    styles.progressLine,
                    { left: currentProgress }
                  ]}
                />
              )}

              {/* Start Handle */}
              <View
                {...startPanResponder.panHandlers}
                style={[styles.handle, styles.startHandle, { left: startPosition - HANDLE_WIDTH }]}
              >
                <View style={styles.handleGrip} />
              </View>

              {/* End Handle */}
              <View
                {...endPanResponder.panHandlers}
                style={[styles.handle, styles.endHandle, { left: endPosition }]}
              >
                <View style={styles.handleGrip} />
              </View>

              {/* Selection Overlay */}
              <View
                style={[
                  styles.selectionOverlay,
                  {
                    left: startPosition,
                    width: endPosition - startPosition,
                  },
                ]}
              />
            </View>

            {/* Instructions */}
            {/* <View style={styles.instructionsBox}>
              <MaterialCommunityIcons name="information-outline" size={18} color={accent} />
              <Text style={styles.instructionsText}>
                Drag the handles to select the portion you want to keep
              </Text>
            </View> */}

            {/* Manual Controls */}
            <View style={styles.manualControlsContainer}>
              {/* Start Time Controls */}
              <View style={styles.manualControl}>
                <Text style={styles.manualControlLabel}>Start Time</Text>
                <View style={styles.manualControlButtons}>
                  <TouchableOpacity
                    style={styles.manualControlBtn}
                    onPress={() => {
                      if (status.playing) player.pause();
                      const newStart = Math.max(0, startTime - 0.1);
                      if (newStart < endTime - 0.1) {
                        setStartTime(newStart);
                        player.seekTo(newStart);
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Ionicons name="remove" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.manualControlValue}>
                    <Text style={styles.manualControlText}>{formatTime(startTime)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.manualControlBtn}
                    onPress={() => {
                      if (status.playing) player.pause();
                      const newStart = Math.min(endTime - 0.1, startTime + 0.1);
                      setStartTime(newStart);
                      player.seekTo(newStart);
                    }}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Ionicons name="add" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* End Time Controls */}
              <View style={styles.manualControl}>
                <Text style={styles.manualControlLabel}>End Time</Text>
                <View style={styles.manualControlButtons}>
                  <TouchableOpacity
                    style={styles.manualControlBtn}
                    onPress={() => {
                      if (status.playing) player.pause();
                      const newEnd = Math.max(startTime + 0.1, endTime - 0.1);
                      setEndTime(newEnd);
                      player.seekTo(startTime);
                    }}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Ionicons name="remove" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.manualControlValue}>
                    <Text style={styles.manualControlText}>{formatTime(endTime)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.manualControlBtn}
                    onPress={() => {
                      if (status.playing) player.pause();
                      const newEnd = Math.min(duration, endTime + 0.1);
                      setEndTime(newEnd);
                      player.seekTo(startTime);
                    }}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Ionicons name="add" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Pick Audio Button */}
            <TouchableOpacity
              style={[styles.pickBtn, loading && { opacity: 0.5 }]}
              onPress={pickAudio}
              activeOpacity={0.8} 
              disabled={loading}
            >
              <Ionicons name="musical-notes" size={22} color={colors.textPrimary} />
              <Text style={styles.pickBtnText}>Change Audio</Text>
            </TouchableOpacity>

            {/* Rename Button */}
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => {
                setTempAudioName(audioName);
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              <Text style={styles.renameBtnLabel}>Rename Audio</Text>
              <View style={styles.renameBtnRight}>
                <Text style={styles.renameBtnValue}>
                  {audioName
                    ? (audioName.length > 17 ? audioName.substring(0, 17) + '...' : audioName)
                    : 'Default'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Audio Format Button */}
            <TouchableOpacity
              style={[styles.renameBtn, (adjustVolume || applyFade) && { opacity: 0.4 }]}
              onPress={() => setFormatModalVisible(true)}
              activeOpacity={0.7}
              disabled={loading || adjustVolume || applyFade}
            >
              <Ionicons name="musical-notes" size={20} color={colors.textPrimary} />
              <Text style={styles.renameBtnLabel}>Audio Format</Text>
              <View style={styles.renameBtnRight}>
                <Text style={styles.renameBtnValue}>
                  {(adjustVolume || applyFade) ? 'WAV' : audioFormat.toUpperCase()}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Volume Toggle */}
            <TouchableOpacity
              style={styles.volumeToggle}
              onPress={() => {
                const newValue = !adjustVolume;
                setAdjustVolume(newValue);
                if (!newValue) {
                  setVolume(100);
                  setVolumeSlider(100);
                }
                Animated.timing(volumeToggleAnim, {
                  toValue: newValue ? 1 : 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start();
              }}
              activeOpacity={0.7}
              disabled={loading}
            >
              <View style={styles.volumeToggleContent}>
                <Ionicons name="volume-high" size={20} color={colors.textPrimary} />
                <Text style={styles.volumeToggleText}>Adjust Volume</Text>
              </View>
              <View style={[styles.toggleSwitch, adjustVolume && styles.toggleSwitchActive]}>
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{
                        translateX: volumeToggleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 24.5]
                        })
                      }]
                    }
                  ]}
                />
              </View>
            </TouchableOpacity>

            {/* Volume Slider (expanded) */}
            {adjustVolume && (
              <View style={styles.volumeSection}>
                <View style={styles.volumeHeader}>
                  <Text style={styles.volumeTitle}>Volume</Text>
                  <Text style={styles.volumeValue}>{volumeSlider}%</Text>
                </View>
                <Slider
                  style={styles.volumeSlider}
                  minimumValue={20}
                  maximumValue={200}
                  step={1}
                  value={volume}
                  onValueChange={(val) => setVolumeSlider(Math.round(val))}
                  onSlidingComplete={(val) => {
                    const rounded = Math.round(val);
                    setVolumeSlider(rounded);
                    setVolume(rounded);
                  }}
                  minimumTrackTintColor={accent}
                  maximumTrackTintColor={colors.pickBorder}
                  thumbTintColor={accent}
                  disabled={loading}
                />
                <View style={styles.volumeLabels}>
                  <Text style={[styles.volumeLabel, volume === 20 && { color: accent, fontWeight: '700' }]}>20%</Text>
                  <Text style={[styles.volumeLabel, volume === 100 && { color: accent, fontWeight: '700' }]}>100%</Text>
                  <Text style={[styles.volumeLabel, volume === 200 && { color: accent, fontWeight: '700' }]}>200%</Text>
                </View>
                <View style={styles.volumeNotice}>
                  <Ionicons name="information-circle-outline" size={16} color={accent} />
                  <Text style={styles.volumeNoticeText}>
                    If custom volume applied, the output will be saved as WAV file by default.
                  </Text>
                </View>
              </View>
            )}

            {/* Fade Toggle */}
            <TouchableOpacity
              style={styles.volumeToggle}
              onPress={() => {
                const newValue = !applyFade;
                setApplyFade(newValue);
                Animated.timing(fadeToggleAnim, {
                  toValue: newValue ? 1 : 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start();
              }}
              activeOpacity={0.7}
              disabled={loading}
            >
              <View style={styles.volumeToggleContent}>
                <MaterialCommunityIcons name="sine-wave" size={20} color={colors.textPrimary} />
                <Text style={styles.volumeToggleText}>Fade In-Out</Text>
              </View>
              <View style={[styles.toggleSwitch, applyFade && styles.toggleSwitchActive]}>
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{
                        translateX: fadeToggleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 24.5]
                        })
                      }]
                    }
                  ]}
                />
              </View>
            </TouchableOpacity>

            {/* Fade Section (expanded) */}
            {applyFade && (
              <View style={styles.volumeSection}>
                {/* Target selection */}
                <View style={styles.fadeTargetRow}>
                  {['start', 'end', 'both'].map(target => (
                    <TouchableOpacity
                      key={target}
                      style={[styles.fadeTargetBtn, fadeTarget === target && styles.fadeTargetBtnActive]}
                      onPress={() => setFadeTarget(target)}
                      disabled={loading}
                    >
                      <Text style={[styles.fadeTargetText, fadeTarget === target && styles.fadeTargetTextActive]}>
                        {target.charAt(0).toUpperCase() + target.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Fade In slider */}
                {(fadeTarget === 'start' || fadeTarget === 'both') && (
                  <View>
                    <View style={styles.volumeHeader}>
                      <Text style={styles.volumeTitle}>Fade In</Text>
                      <Text style={styles.volumeValue}>{fadeInDuration}s</Text>
                    </View>
                    <Slider
                      style={styles.volumeSlider}
                      minimumValue={0.5}
                      maximumValue={5}
                      step={0.5}
                      value={fadeInDuration}
                      onSlidingComplete={(val) => setFadeInDuration(Math.round(val * 2) / 2)}
                      minimumTrackTintColor={accent}
                      maximumTrackTintColor={colors.pickBorder}
                      thumbTintColor={accent}
                      disabled={loading}
                    />
                    <View style={styles.volumeLabels}>
                      <Text style={[styles.volumeLabel, fadeInDuration === 0.5 && { color: accent, fontWeight: '700' }]}>0.5s</Text>
                      <Text style={[styles.volumeLabel, fadeInDuration === 2.5 && { color: accent, fontWeight: '700' }]}>2.5s</Text>
                      <Text style={[styles.volumeLabel, fadeInDuration === 5 && { color: accent, fontWeight: '700' }]}>5s</Text>
                    </View>
                  </View>
                )}

                {/* Fade Out slider */}
                {(fadeTarget === 'end' || fadeTarget === 'both') && (
                  <View style={(fadeTarget === 'both') ? { marginTop: 12 } : {}}>
                    <View style={styles.volumeHeader}>
                      <Text style={styles.volumeTitle}>Fade Out</Text>
                      <Text style={styles.volumeValue}>{fadeOutDuration}s</Text>
                    </View>
                    <Slider
                      style={styles.volumeSlider}
                      minimumValue={0.5}
                      maximumValue={5}
                      step={0.5}
                      value={fadeOutDuration}
                      onSlidingComplete={(val) => setFadeOutDuration(Math.round(val * 2) / 2)}
                      minimumTrackTintColor={accent}
                      maximumTrackTintColor={colors.pickBorder}
                      thumbTintColor={accent}
                      disabled={loading}
                    />
                    <View style={styles.volumeLabels}>
                      <Text style={[styles.volumeLabel, fadeOutDuration === 0.5 && { color: accent, fontWeight: '700' }]}>0.5s</Text>
                      <Text style={[styles.volumeLabel, fadeOutDuration === 2.5 && { color: accent, fontWeight: '700' }]}>2.5s</Text>
                      <Text style={[styles.volumeLabel, fadeOutDuration === 5 && { color: accent, fontWeight: '700' }]}>5s</Text>
                    </View>
                  </View>
                )}

                <View style={styles.volumeNotice}>
                  <Ionicons name="information-circle-outline" size={16} color={accent} />
                  <Text style={styles.volumeNoticeText}>
                    Fade effect will be applied to the output. Output will be saved as WAV file.
                  </Text>
                </View>
              </View>
            )}

          </View>
        )}

        {/* Trim Button */}
        {audio && duration > 0 && !trimmedUri && (
          <TouchableOpacity
            style={[styles.trimBtn, loading && styles.btnDisabled]}
            onPress={trimAudio}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialCommunityIcons name="content-cut" size={24} color="white" />
            )}
            <Text style={[styles.trimBtnText, loading && styles.textDisabled]}>
              {loading ? 'Trimming...' : 'Trim Audio'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Result Section */}
        {trimmedUri && (
          <View style={styles.resultSection}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={accent} />
              <Text style={styles.successText}>Audio Trimmed!</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveAudio} activeOpacity={0.8} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.saveBtnText} />
                ) : (
                  <Ionicons name="download" size={20} color={colors.saveBtnText} />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareAudio} activeOpacity={0.8}>
                <Ionicons name="share" size={20} color={colors.shareBtnText} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setTrimmedUri(null);
                if (duration > 0) {
                  setStartTime(0);
                  setEndTime(duration);
                }
                setAdjustVolume(false);
                setVolume(100);
                setVolumeSlider(100);
                volumeToggleAnim.setValue(0);
                setApplyFade(false);
                setFadeTarget('both');
                setFadeInDuration(1);
                setFadeOutDuration(1);
                fadeToggleAnim.setValue(0);
                // Reset player to beginning
                if (status.playing) {
                  player.pause();
                }
                player.seekTo(0);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.retryBtnText}>Trim Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Rename Audio Modal */}
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
                  <Text style={styles.renameModalTitle}>Rename Audio</Text>

                  <TextInput
                    style={styles.renameInput}
                    placeholder="Enter audio name..."
                    placeholderTextColor={colors.textSecondary}
                    value={tempAudioName}
                    onChangeText={setTempAudioName}
                    autoFocus
                  />

                  <View style={styles.renameButtonsContainer}>
                    <TouchableOpacity
                      style={styles.renameCancelButton}
                      onPress={() => {
                        setRenameModalVisible(false);
                        setTempAudioName(audioName);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.renameCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.renameDoneButton}
                      onPress={() => {
                        if (tempAudioName.trim() === '') {
                          setAudioName('');
                          setRenameModalVisible(false);
                          triggerToast('Success', 'Audio name reset to default', 'success', 2000);
                          return;
                        }
                        setAudioName(tempAudioName);
                        setRenameModalVisible(false);
                        triggerToast('Success', 'Audio name updated', 'success', 2000);
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

      {/* Format Selection Modal */}
      <Modal
        visible={formatModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormatModalVisible(false)}
      >
        <Pressable style={styles.formatModalOverlay} onPress={() => setFormatModalVisible(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.formatModalContent} onPress={() => {}}>
            <View style={styles.formatModalHeader}>
              <Text style={styles.formatModalTitle}>Select Audio Format</Text>
              <TouchableOpacity onPress={() => setFormatModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formatScrollView} showsVerticalScrollIndicator={false}>
              {[
                { key: 'm4a', label: 'M4A', desc: 'Best quality, no re-encoding', icon: 'file-music' },
                { key: 'wav', label: 'WAV', desc: 'Uncompressed, lossless quality', icon: 'music-note' }
              ].map((format, index) => (
                <TouchableOpacity
                  key={format.key}
                  style={[
                    styles.formatOption,
                    audioFormat === format.key && styles.formatOptionActive,
                    index === 1 && styles.formatOptionLast, {marginBottom:index == 1? 30:10}
                  ]}
                  onPress={() => {
                    setAudioFormat(format.key);
                    setFormatModalVisible(false);
                    triggerToast('Audio Format', `Set to ${format.label}`, 'info', 2000);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.formatOptionLeft}>
                    <MaterialCommunityIcons name={format.icon} size={24} color={colors.textPrimary} />
                    <View>
                      <Text style={styles.formatOptionText}>{format.label}</Text>
                      <Text style={styles.formatOptionDesc}>{format.desc}</Text>
                    </View>
                  </View>
                  {audioFormat === format.key && (
                    <Ionicons name="checkmark-circle" size={24} color={accent} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
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

  // Audio Card
  audioCard: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 35,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  audioTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  audioIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioInfo: {
    flex: 1,
  },
  audioName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  audioDuration: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.border2,
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: 2,
  },
  progressTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressTime: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
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

  // Trim Section
  trimSection: {
    marginTop: 24,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },

  // Time Display
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 56,
    padding: 8,
    paddingHorizontal:30,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  timeItem: {
    alignItems: 'center',
  },
  timeLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  timeValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },

  // Waveform
  waveformContainer: {
    width: CONTAINER_WIDTH,
    height: 100,
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    overflow: 'visible',
  },
  waveformBg: {
    position: 'absolute',
    left: HANDLE_WIDTH,
    right: HANDLE_WIDTH,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  progressLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#8d8d8d',
    zIndex: 5,
    borderRadius:40
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  startHandle: {
    backgroundColor: accent,
    borderTopLeftRadius:19,
    borderBottomLeftRadius:19
  },
  endHandle: {
    backgroundColor: accent,
    borderTopRightRadius:19,
    borderBottomRightRadius:19
  },
  handleGrip: {
    width: 4,
    height: 30,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: accent,
    borderBottomColor: accent,
    zIndex: 1,
  },

  // Instructions
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: accent + '15',
    borderRadius: 52,
    padding: 12,
    paddingHorizontal:17,
    marginTop: 16,
    gap: 10,
  },
  instructionsText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },

  // Manual Controls
  manualControlsContainer: {
    marginTop: 20,
    flexDirection: 'column', // Row on tablet, column on phone
    gap: 12,
  },
  manualControl: {
    flex: SCREEN_WIDTH >= 600 ? 1 : undefined, // Flex only on tablet
    width: SCREEN_WIDTH >= 600 ? undefined : '100%', // Full width on phone
    backgroundColor: colors.card,
    borderRadius: 30,
    padding: 10,
    paddingBottom:15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualControlLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  manualControlButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  manualControlBtn: {
    width: 70,
    height: 40,
    borderRadius: 50,
    backgroundColor: accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: accent + '40',
  },
  manualControlValue: {
    minWidth: 70,
    paddingVertical: 8,
    paddingHorizontal: 32,
    backgroundColor: colors.bg,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
  },
  manualControlText: {
    color: accent,
    fontSize: 16,
    fontWeight: '800',
  },

  // Volume Toggle
  volumeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
    borderWidth: 1,
    borderColor: isDark ? '#444' : '#ddd',
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 12,
  },
  volumeToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  volumeToggleText: {
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

  // Volume Slider Section
  volumeSection: {
    marginTop: 12,
    backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
    borderWidth: 1,
    borderColor: isDark ? '#444' : '#ddd',
    borderRadius: 30,
    padding: 20,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  volumeTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  volumeValue: {
    color: accent,
    fontSize: 18,
    fontWeight: '800',
  },
  volumeSlider: {
    width: '100%',
    height: 50,
  },
  volumeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  volumeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  volumeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#3a3a3a' : '#d0d0d0',
  },
  volumeNoticeText: {
    flex: 1,
    color: accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },

  // Fade Target Selection
  fadeTargetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  fadeTargetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 60,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: isDark ? '#444' : '#ddd',
    backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
  },
  fadeTargetBtnActive: {
    borderColor: accent,
    backgroundColor: accent + '20',
  },
  fadeTargetText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  fadeTargetTextActive: {
    color: accent,
  },

  // Trim Button
  trimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accent,
    borderRadius: 60,
    paddingVertical: 16,
    marginTop: 20,
    gap: 10,
  },
  trimBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    backgroundColor: '#8f1010',
  },
  textDisabled: {
    color: 'lightgrey',
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
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
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

  // Rename Button
  renameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    paddingVertical:20,
    marginTop: 12,
    gap: 12,
  },
  renameBtnLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  renameBtnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameBtnValue: {
    color: "red",
    fontSize: 14,
    fontWeight: '600',
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

  // Format Modal
  formatModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  formatModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
  },
  formatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  formatModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  formatScrollView: {
    maxHeight: 300,
    paddingHorizontal: 20,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: 56,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  formatOptionActive: {
    borderColor: accent,
    backgroundColor: accent + '10',
  },
  formatOptionLast: {
    marginBottom: 0,
  },
  formatOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  formatOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  formatOptionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

export default AudioTrimmer;
