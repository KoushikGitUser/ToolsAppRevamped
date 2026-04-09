import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Ionicons,
  Feather,
  MaterialIcons,
  MaterialCommunityIcons,
  AntDesign,
  FontAwesome5,
} from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';

const AUDIO_CARDS = [
  {
    title: 'Audio Trimmer',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="musical-notes" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialCommunityIcons name="content-cut" size={22} color={color} />
      </>
    ),
    accent: '#9C27B0',
    screen: 'AudioTrimmer',
    badge: true,
  },
  {
    title: 'Audio Compressor',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="musical-notes" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <AntDesign name="compress" size={22} color={color} />
      </>
    ),
    accent: '#cb0086',
    screen: 'AudioCompressor',
  },
  {
    title: 'Audio Merger',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="musical-notes" size={22} color={color} />
        <MaterialCommunityIcons name="merge" size={19} color={color} />
        <Ionicons name="musical-note" size={22} color={color} />
      </>
    ),
    accent: '#6200EA',
    screen: 'AudioMerger',
    badge: true,
  },
];

const AudioTools = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Audio Tools</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes" size={64} color={colors.emptyIcon} />
          <Text style={styles.emptyTitle}>Audio Tools</Text>
          <Text style={styles.emptyDesc}>Trim, compress, and merge audio files</Text>
        </View>

        {AUDIO_CARDS.map((card, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(card.screen)}
          >
            <View
              style={[
                styles.card,
                {
                  borderColor: card.accent + '80',
                  backgroundColor: card.accent + '20',
                },
              ]}
            >
              <View
                style={[
                  styles.iconContainer,
                  card.wideIcon && styles.iconContainerWide,
                  { backgroundColor: card.accent + '20' },
                ]}
              >
                {card.iconComponent(card.accent)}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardTitle}>{card.title}</Text>
              </View>
              {card.badge && <MaterialCommunityIcons name="crown-circle" size={30} color="orange" style={{ position: 'absolute', top: -8, right: -0 }} />}
              <MaterialIcons
                name="keyboard-arrow-right"
                size={28}
                color={isDark ? 'white' : 'black'}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const createStyles = (colors, isDark) =>
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
    },
    iconContainer: {
      width: 50,
      height: 50,
      borderRadius: 54,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    iconContainerWide: {
      width: 110,
      flexDirection: 'row',
      gap: 8,
    },
    cardTextContainer: { flex: 1 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });

export default AudioTools;
