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
  FontAwesome5,
  Feather,
  MaterialIcons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';

const ACCENT = '#D50000';

const PDF_CARDS = [
  {
    title: 'Image to PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="image" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <FontAwesome5 name="file-pdf" size={22} color={color} />
      </>
    ),
    accent: '#D50000',
    screen: 'ImageToPdf',
    desc: 'Convert images into a PDF document',
  },
  {
    title: 'PDF to JPG',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="arrow-right" size={19} color={color} />
        <Ionicons name="image" size={22} color={color} />
      </>
    ),
    accent: '#00897B',
    screen: 'PdfToJpg',
    desc: 'Convert PDF pages to JPG images',
  },
  {
    title: 'Text to PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <MaterialCommunityIcons name="text-box-outline" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <FontAwesome5 name="file-pdf" size={22} color={color} />
      </>
    ),
    accent: '#9C27B0',
    screen: 'TextToPDF',
    desc: 'Convert text content into a PDF document',
  },
  {
    title: 'PDF Editor',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialCommunityIcons name="file-document-edit-outline" size={22} color={color} />
      </>
    ),
    accent: '#5C6BC0',
    screen: 'PDFEditor',
    desc: 'Draw, add text, sign, highlight, and edit PDF pages',
    badge: true,
  },
  {
    title: 'Merge PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Ionicons name="add" size={20} color={color} />
        <FontAwesome5 name="file-pdf" size={22} color={color} />
      </>
    ),
    accent: '#E53935',
    screen: 'MergePDF',
    desc: 'Combine multiple PDFs into one',
  },
  {
    title: 'Split PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="scissors" size={20} color={color} />
        <MaterialCommunityIcons name="file-document-multiple" size={22} color={color} />
      </>
    ),
    accent: '#FF6D00',
    screen: 'SplitPDF',
    desc: 'Split a PDF into individual pages',
  },
  {
    title: 'Extract PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="arrow-right" size={20} color={color} />
        <MaterialCommunityIcons name="file-check" size={22} color={color} />
      </>
    ),
    accent: '#AB47BC',
    screen: 'ExtractPDF',
    desc: 'Extract specific pages from a PDF',
  },
  {
    title: 'Open/Show PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="arrow-right" size={19} color={color} />
        <Ionicons name="eye" size={22} color={color} />
      </>
    ),
    accent: '#E57373',
    screen: 'ShowPDF',
    desc: 'Open and view PDF files',
  },
  {
    title: 'Lock/Unlock PDF',
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={22} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialCommunityIcons name="lock" size={22} color={color} />
      </>
    ),
    accent: '#1E88E5',
    screen: 'LockUnlockPDF',
    desc: 'Password protect or unlock a PDF',
    badge: true,
  },
];

const PDFTools = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>PDF Tools</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Empty State */}
        <View style={styles.emptyState}>
          <FontAwesome5 name="file-pdf" size={64} color={colors.emptyIcon} />
          <Text style={styles.emptyTitle}>PDF Tools</Text>
          <Text style={styles.emptyDesc}>Convert images to PDF, merge, split, extract, and secure pages</Text>
        </View>

        {/* Cards */}
        {PDF_CARDS.map((card, index) => (
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
    cardTextContainer: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardDesc: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
    },
  });

export default PDFTools;
