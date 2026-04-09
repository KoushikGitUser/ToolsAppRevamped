import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useState, useMemo } from "react";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
  FontAwesome6,
  Ionicons,
  Entypo,
  Feather,
  FontAwesome,
} from "@expo/vector-icons";
import { BlurView } from "@react-native-community/blur";
import { useTheme } from "../Services/ThemeContext";

const CARDS = [
  {
    title: "PDF Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome5 name="file-pdf" size={27} color={color} />
        <Feather name="repeat" size={22} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#D50000",
    screen: "PDFTools",
  },
  {
    title: "Audio Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="musical-notes" size={27} color={color} />
        <Feather name="repeat" size={22} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#9C27B0",
    screen: "AudioTools",
  },
  {
    title: "Video Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="videocam" size={27} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#3f51c3",
    screen: "VideoTools",
  },
  {
    title: "Image Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="image" size={27} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#ffa200",
    screen: "ImageTools",
  },
  {
    title: "Camera Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Entypo name="camera" size={27} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#FF6F00",
    screen: "CameraTools",
  },
  {
    title: "ZIP Tools",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <MaterialCommunityIcons name="folder-zip" size={27} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <Entypo name="tools" size={27} color={color} />
      </>
    ),
    accent: "#2E7D32",
    screen: "ZipTools",
  },
  {
    title: "Text To Speech",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <Ionicons name="document-text" size={24} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <FontAwesome6 name="volume-high" size={24} color={color} />
      </>
    ),
    accent: "#00f2ff",
    screen: "TextToSpeech",
  },
  {
    title: "Cache Manager",
    wideIcon: true,
    iconComponent: (color) => (
      <>
        <FontAwesome name="android" size={24} color={color} />
        <Feather name="repeat" size={19} color={color} />
        <MaterialCommunityIcons name="broom" size={24} color={color} />
      </>
    ),
    accent: "#00b490",
    screen: "AppCacheManager",
    badge: true,
  },
];

const FEATURES = [
  {
    icon: <FontAwesome5 name="file-pdf" size={18} color="#D50000" />,
    accent: "#D50000",
    title: "PDF Tools",
    desc: "Merge, split, extract pages, convert images to PDF, lock/unlock PDFs, and export to JPG.",
  },
  {
    icon: <Ionicons name="musical-notes" size={20} color="#9C27B0" />,
    accent: "#9C27B0",
    title: "Audio Tools",
    desc: "Trim, compress, and merge audio files with precision and ease.",
  },
  {
    icon: <Ionicons name="videocam" size={20} color="#3f51c3" />,
    accent: "#3f51c3",
    title: "Video Tools",
    desc: "Compress videos, extract audio tracks, and create animated GIFs.",
  },
  {
    icon: <Ionicons name="image" size={20} color="#ffa200" />,
    accent: "#ffa200",
    title: "Image Tools",
    desc: "Compress images, convert formats, apply blur effects, and pick colors.",
  },
  {
    icon: <Entypo name="camera" size={20} color="#FF6F00" />,
    accent: "#FF6F00",
    title: "Camera Tools",
    desc: "Extract text from images using OCR and scan or generate QR codes.",
  },
  {
    icon: <MaterialCommunityIcons name="folder-zip" size={20} color="#2E7D32" />,
    accent: "#2E7D32",
    title: "ZIP Tools",
    desc: "Create password-protected ZIP files and extract locked ZIP archives securely.",
  },
  {
    icon: <FontAwesome6 name="volume-high" size={20} color="#00f2ff" />,
    accent: "#00f2ff",
    title: "Text To Speech",
    desc: "Convert any text into natural-sounding speech.",
  },
  {
    icon: <MaterialCommunityIcons name="cached" size={20} color="#00b490" />,
    accent: "#00b490",
    title: "Cache Manager",
    desc: "View and manage app cache sizes. Tap any app to open its settings and clear cache.",
  },
];

const Home = ({ navigation }) => {
  const [infoVisible, setInfoVisible] = useState(false);
  const { colors, isDark, themeMode, setTheme } = useTheme();
  const [themeSelectorVisible, setThemeSelectorVisible] = useState(false);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Tools</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setThemeSelectorVisible(true)}
            style={styles.themeToggle}
            activeOpacity={0.7}
          >
            {themeMode === 'dark' && <Ionicons name="moon" size={24} color="#89CFF0" />}
            {themeMode === 'light' && <Ionicons name="sunny" size={24} color="#FFA500" />}
            {themeMode === 'system' && <MaterialCommunityIcons name="circle-slice-4" size={24} color="#999" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setInfoVisible(true)}
            style={styles.infoBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name="information-circle-outline"
              size={28}
              color={colors.sectionSubtitle}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Grid: first 6 cards (PDF / Audio / Video / Image / Camera / ZIP) */}
        <View style={styles.gridWrap}>
          {CARDS.slice(0, -2).map((card, index) => (
            <TouchableOpacity
              key={`grid-${index}`}
              activeOpacity={0.85}
              onPress={() => navigation.navigate(card.screen)}
              style={styles.gridCardWrapper}
            >
              <View
                style={[
                  styles.gridCard,
                  {
                    borderColor: card.accent + "80",
                    backgroundColor: card.accent + "20",
                  },
                ]}
              >
                <View
                  style={[
                    styles.gridIconContainer,
                    card.wideIcon && styles.gridIconContainerWide,
                    { backgroundColor: card.accent + "20" },
                  ]}
                >
                  {card.iconComponent(card.accent)}
                </View>
                <View style={styles.gridCardFooter}>
                  <Text style={[styles.gridCardTitle, { color: card.accent }]} numberOfLines={1}>{card.title}</Text>
                  <MaterialIcons
                    name="keyboard-arrow-right"
                    size={24}
                    color={card.accent}
                  />
                </View>
                {card.badge && (
                  <MaterialCommunityIcons
                    name="crown-circle"
                    size={28}
                    color="orange"
                    style={{ position: 'absolute', top: -6, right: -2 }}
                  />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Full-width cards: Text To Speech & Cache Manager */}
        {CARDS.slice(-2).map((card, index) => (
          <TouchableOpacity
            key={`full-${index}`}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(card.screen)}
          >
            <View
              style={[
                styles.card,
                {
                  borderColor: card.accent + "80",
                  backgroundColor: card.accent + "20",
                },
              ]}
            >
              <View
                style={[
                  styles.iconContainer,
                  card.wideIcon && styles.iconContainerWide,
                  { backgroundColor: card.accent + "20" },
                ]}
              >
                {card.iconComponent(card.accent)}
              </View>
              <Text style={[styles.cardTitle, { flex: 1 }]}>{card.title}</Text>
              {card.badge && <MaterialCommunityIcons name="crown-circle" size={30} color="orange" style={{ position: 'absolute', top: -8, right: -0 }} />}
              <MaterialIcons
                name="keyboard-arrow-right"
                size={28}
                color={isDark ? "white" : "black"}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Info Modal */}
      <Modal
        visible={infoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            blurType={colors.blurType}
            blurAmount={10}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.modalBox}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About This App</Text>
              <TouchableOpacity
                onPress={() => setInfoVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.sectionSubtitle}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              A powerful all-in-one toolkit for media processing — right on your
              device.
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.featureScroll}
            >
              {/* Security Section */}
              <View style={styles.securityCard}>
                <View style={styles.securityHeader}>
                  <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
                  <Text style={styles.securityTitle}>Security First</Text>
                </View>
                <Text style={styles.securityDesc}>
                  This is a completely offline application. All your images,
                  documents, and data are processed locally on your device.
                  Nothing is uploaded to any server or shared with third
                  parties. Your privacy and security are our top priority.
                </Text>
              </View>

              {/* Features */}
              {FEATURES.map((f, i) => (
                <View
                  key={i}
                  style={[styles.featureRow, { borderColor: f.accent + "30" }]}
                >
                  <View
                    style={[
                      styles.featureIconBox,
                      { backgroundColor: f.accent + "20" },
                    ]}
                  >
                    {f.icon}
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Credit */}
            <View style={styles.creditRow}>
              <Text style={styles.creditText}>Designed & Developed by</Text>
              <Text style={styles.creditName}>Koushik Chakraborty</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Theme Selector Modal */}
      <Modal
        visible={themeSelectorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setThemeSelectorVisible(false)}
      >
        <Pressable style={styles.themeModalOverlay} onPress={() => setThemeSelectorVisible(false)}>
          <BlurView blurType={colors.blurType} blurAmount={10} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.themeModalContent} onPress={() => {}}>
            <View style={styles.themeModalHeader}>
              <Text style={styles.themeModalTitle}>Appearance</Text>
              <TouchableOpacity onPress={() => setThemeSelectorVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {[
              { mode: 'light', label: 'Light', sub: 'Always use light mode', icon: <Ionicons name="sunny" size={24} color="#FFA500" /> },
              { mode: 'dark', label: 'Dark', sub: 'Always use dark mode', icon: <Ionicons name="moon" size={24} color="#89CFF0" /> },
              { mode: 'system', label: 'Auto', sub: 'Follow device setting', icon: <MaterialCommunityIcons name="circle-slice-4" size={24} color="#999" /> },
            ].map(({ mode, label, sub, icon }) => (
              <TouchableOpacity
                key={mode}
                style={[styles.themeOption, themeMode === mode && styles.themeOptionActive]}
                onPress={() => { setTheme(mode); setThemeSelectorVisible(false); }}
                activeOpacity={0.7}
              >
                <View style={styles.themeOptionLeft}>
                  {icon}
                  <View>
                    <Text style={styles.themeOptionLabel}>{label}</Text>
                    <Text style={styles.themeOptionSub}>{sub}</Text>
                  </View>
                </View>
                {themeMode === mode && <Ionicons name="checkmark-circle" size={24} color="#FF0000" />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Platform.OS === "android" ? StatusBar.currentHeight + 50 : 60,
      marginBottom: 20,
      paddingHorizontal: 20,
    },
    heading: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.textPrimary,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    themeToggle: {
      padding: 8,
      borderRadius: 50,
      backgroundColor: isDark ? '#2e2e2e' : '#e8e8e8',
    },
    infoBtn: {
      padding: 4,
    },

    // Cards
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 100,
    },
    separator: {
      height: 5,
      borderRadius: 10,
      width: "15%",
      margin: "auto",
      backgroundColor: isDark ? "#444" : "#ccc",
      marginBottom: 30,
      marginTop:15
    },
    // Grid layout (2 cards per row)
    gridWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    gridCardWrapper: {
      width: "48%",
      marginBottom: 14,
    },
    gridCard: {
      borderRadius: 38,
      padding: 8,
      paddingBottom:20,
      borderWidth: 1,
      alignItems: "center",
    },
    gridIconContainer: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    gridIconContainerWide: {
      width: "100%",
      height: 60,
      flexDirection: "row",
      justifyContent:"space-between",
      paddingHorizontal:25,
      borderRadius: 52,
    },
    gridCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "90%",
    },
    gridCardTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "900",
      color: colors.textPrimary,
    },

    card: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      borderRadius: 56,
      padding: 10,
      marginBottom: 14,
      borderWidth: 1,
    },
    iconContainer: {
      width: 50,
      height: 50,
      borderRadius: 54,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 16,
    },
    iconContainerWide: {
      width: 110,
      flexDirection: "row",
      gap: 8,
    },
    cardTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "900",
      color: colors.textPrimary,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    modalBox: {
      backgroundColor: colors.modalBg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 36,
      maxHeight: "85%",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textTertiary,
      marginBottom: 20,
      lineHeight: 18,
    },

    securityCard: {
      backgroundColor: isDark ? "#1B5E20" : "#C8E6C9",
      borderRadius: 25,
      padding: 16,
      marginBottom: 20,
    },
    securityHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    securityTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: isDark ? "#FFFFFF" : "#1B5E20",
    },
    securityDesc: {
      fontSize: 13,
      color: isDark ? "#E8F5E9" : "#2E7D32",
      lineHeight: 20,
    },

    featureScroll: {
      flexShrink: 1,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.card,
      borderRadius: 25,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    featureIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    featureText: {
      flex: 1,
    },
    featureTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 3,
    },
    featureDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },

    // Credit
    creditRow: {
      alignItems: "center",
      marginTop: 24,
      marginBottom: 50,
      gap: 4,
    },
    creditText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    creditName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    themeModalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    themeModalContent: {
      backgroundColor: colors.modalBg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 36,
    },
    themeModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    themeModalTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    themeOption: {
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
    themeOptionActive: {
      borderColor: '#FF0000',
      backgroundColor: isDark ? '#2a0000' : '#fff0f0',
    },
    themeOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    themeOptionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    themeOptionSub: {
      fontSize: 13,
      fontWeight: '400',
      color: colors.textTertiary,
      marginTop: 2,
    },
  });

export default Home;
