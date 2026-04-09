import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';

const ACCENT = '#009688';

const BLUR_OPTIONS = [
  {
    title: 'Image Blur',
    desc: 'Pick an image, apply blur and save',
    iconComponent: (color) => (
      <>
        <Ionicons name="image" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialIcons name="blur-on" size={22} color={color} />
      </>
    ),
    screen: 'ImageBlur',
  },
  {
    title: 'Wallpaper Blur',
    desc: 'Fetch current wallpaper, blur and set',
    iconComponent: (color) => (
      <>
        <Ionicons name="phone-portrait-outline" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialIcons name="blur-on" size={22} color={color} />
      </>
    ),
    screen: 'WallpaperBlur',
  },
];

const isWallpaperBlocked = Platform.OS === 'android' && Platform.Version >= 33;

const FullBlur = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [unavailableModal, setUnavailableModal] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Blur Wallpaper</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.emptyState}>
          <MaterialIcons name="blur-on" size={64} color={colors.emptyIcon} />
          <Text style={styles.emptyTitle}>Blur Tools</Text>
          <Text style={styles.emptyDesc}>
            Blur images from your gallery or blur your current wallpaper directly
          </Text>
        </View>

        {BLUR_OPTIONS.map((card, index) => {
          const isBlocked = card.screen === 'WallpaperBlur' && isWallpaperBlocked;
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.85}
              onPress={() => isBlocked ? setUnavailableModal(true) : navigation.navigate(card.screen)}
              style={isBlocked && { opacity: 0.45 }}
            >
              <View style={styles.card}>
                <View style={styles.iconContainer}>
                  {card.iconComponent(ACCENT)}
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDesc}>{card.desc}</Text>
                </View>
                <MaterialIcons
                  name="keyboard-arrow-right"
                  size={28}
                  color={isDark ? 'white' : 'black'}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={unavailableModal}
        transparent
        animationType="fade"
        onRequestClose={() => setUnavailableModal(false)}
      >
        <View style={styles.unavailOverlay}>
          <View style={styles.unavailBox}>
            <MaterialCommunityIcons name="lock-outline" size={40} color={ACCENT} style={{ marginBottom: 14 }} />
            <Text style={styles.unavailTitle}>Unvailable on Android 13 or 13+</Text>
            <Text style={styles.unavailBody}>
              Starting from Android 13, Google restricted device's current wallpaper access for third-party apps as wallpaper may contains Bank details, Passwords/PIN etc. {'\n\n'}
            </Text>
            <TouchableOpacity
              style={styles.unavailBtn}
              onPress={() => setUnavailableModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.unavailBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors) =>
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
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.textTertiary, marginTop: 20 },
    emptyDesc: {
      fontSize: 14, color: colors.textMuted, textAlign: 'center',
      marginTop: 8, lineHeight: 20, paddingHorizontal: 20,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      borderRadius: 56,
      padding: 10,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: ACCENT + '80',
      backgroundColor: ACCENT + '20',
    },
    iconContainer: {
      width: 110,
      height: 50,
      borderRadius: 54,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
      backgroundColor: ACCENT + '20',
    },
    cardTextContainer: { flex: 1 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    cardDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  unavailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  unavailBox: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  unavailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  unavailBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  unavailBtn: {
    backgroundColor: ACCENT,
    borderRadius: 60,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  unavailBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  });

export default FullBlur;
