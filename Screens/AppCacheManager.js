import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, Feather } from '@expo/vector-icons';
import { useTheme } from '../Services/ThemeContext';
import { triggerToast } from '../Services/toast';
import {
  hasUsagePermission,
  openUsagePermissionSettings,
  getInstalledApps,
  openAppSettings,
} from '../modules/app-cache-manager';

const ACCENT = '#00b490';

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const AppCacheManager = ({ navigation }) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const totalCache = useMemo(() => {
    return apps.reduce((sum, app) => sum + app.cacheSize, 0);
  }, [apps]);

  const checkPermission = useCallback(() => {
    const granted = hasUsagePermission();
    setHasPermission(granted);
    return granted;
  }, []);

  useEffect(() => {
    checkPermission();
  }, []);

  const loadApps = useCallback(async () => {
    if (!checkPermission()) return;
    setLoading(true);
    try {
      const result = await getInstalledApps();
      setApps(result.filter(a => a.cacheSize > 0));
    } catch (e) {
      triggerToast('Error', e.message, 'error', 3000);
    } finally {
      setLoading(false);
    }
  }, [checkPermission]);

  useEffect(() => {
    if (hasPermission) {
      loadApps();
    }
  }, [hasPermission]);

  const handleGrantPermission = () => {
    openUsagePermissionSettings();
    // Check after user returns
    const interval = setInterval(() => {
      if (checkPermission()) {
        clearInterval(interval);
      }
    }, 1000);
    // Clear after 60s to prevent leak
    setTimeout(() => clearInterval(interval), 60000);
  };

  const TUTORIAL_STEPS = [
    {
      title: 'Step 1: Open Settings',
      desc: 'Tap the button below to open Usage Access settings.',
      icon: 'settings',
    },
    {
      title: 'Step 2: Find Tools App',
      desc: 'Look for "Tools App" in the list of apps.',
      icon: 'search',
    },
    {
      title: 'Step 3: Enable Access',
      desc: 'Tap on "Tools App" and toggle the switch to allow usage access.',
      icon: 'toggle-on',
    },
    {
      title: 'Step 4: Come Back',
      desc: 'Return to the app. The cache data will load automatically.',
      icon: 'check-circle',
    },
  ];

  const renderAppItem = ({ item }) => (
    <TouchableOpacity
      style={styles.appItem}
      activeOpacity={0.7}
      onPress={() => {
        openAppSettings(item.packageName);
        triggerToast('App Info', `Opened settings for ${item.appName}`, 'info', 2000);
      }}
    >
      <View style={styles.appItemLeft}>
        {item.icon ? (
          <Image
            source={{ uri: `data:image/png;base64,${item.icon}` }}
            style={styles.appIcon}
          />
        ) : (
          <View style={[styles.appIcon, styles.appIconPlaceholder]}>
            <MaterialIcons name="android" size={24} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.appTextContainer}>
          <Text style={styles.appName} numberOfLines={1}>{item.appName}</Text>
          <Text style={styles.appPackage} numberOfLines={1}>{item.packageName}</Text>
          <Text style={styles.cacheLine}>
            Occupied cache - <Text style={{ color: item.cacheSize > 50 * 1024 * 1024 ? '#F44336' : item.cacheSize > 10 * 1024 * 1024 ? '#FF9800' : ACCENT, fontWeight: '700' }}>{formatSize(item.cacheSize)}</Text>
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.heading}>Cache Manager</Text>
        {hasPermission && (
          <TouchableOpacity onPress={loadApps} style={styles.refreshBtn} disabled={loading}>
            <Ionicons name="refresh" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      {!hasPermission ? (
        /* Permission Tutorial */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tutorialContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.tutorialIconCircle}>
            <MaterialCommunityIcons name="shield-lock-outline" size={48} color={ACCENT} />
          </View>
          <Text style={styles.tutorialTitle}>Usage Access Required</Text>
          <Text style={styles.tutorialDesc}>
            To view app cache sizes, this app needs "Usage Access" permission. This is a special permission that must be granted manually in system settings.
          </Text>

          <View style={styles.stepsContainer}>
            {TUTORIAL_STEPS.map((step, index) => (
              <View key={index} style={[styles.stepItem, tutorialStep === index && styles.stepItemActive]}>
                <View style={[styles.stepNumber, tutorialStep >= index && styles.stepNumberDone]}>
                  {tutorialStep > index ? (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  ) : (
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  )}
                </View>
                <View style={styles.stepTextContainer}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.grantBtn}
            onPress={() => {
              setTutorialStep(1);
              handleGrantPermission();
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="settings" size={20} color="#fff" />
            <Text style={styles.grantBtnText}>Open Usage Access Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkBtn}
            onPress={() => {
              if (checkPermission()) {
                setTutorialStep(4);
              } else {
                triggerToast('Not Granted', 'Permission not yet granted. Please follow the steps above.', 'error', 3000);
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.checkBtnText}>I've Granted Permission</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* App List */
        <View style={{ flex: 1 }}>
          {/* Total Cache Banner */}
          {apps.length > 0 && (
            <View style={styles.totalBanner}>
              <View style={styles.totalLeft}>
                <MaterialCommunityIcons name="cached" size={28} color={ACCENT} />
                <View>
                  <Text style={styles.totalLabel}>Total Cache</Text>
                  <Text style={styles.totalValue}>{formatSize(totalCache)}</Text>
                </View>
              </View>
              <Text style={styles.totalApps}>{apps.length} apps</Text>
            </View>
          )}

          <Text style={styles.infoText}>
            Tap an app to open its settings where you can clear cache manually.
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>Scanning apps...</Text>
            </View>
          ) : (
            <FlatList
              data={apps}
              renderItem={renderAppItem}
              keyExtractor={(item) => item.packageName}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="broom" size={64} color={colors.emptyIcon} />
                  <Text style={styles.emptyTitle}>All Clean!</Text>
                  <Text style={styles.emptyDesc}>No apps with cache found.</Text>
                </View>
              }
            />
          )}
        </View>
      )}
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
      paddingBottom: 16,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 60,
    },
    backBtn: { padding: 8, marginRight: 8 },
    heading: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      flex: 1,
    },
    refreshBtn: { padding: 8 },

    // Tutorial
    tutorialContainer: {
      paddingHorizontal: 24,
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 40,
    },
    tutorialIconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: ACCENT + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    tutorialTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
    },
    tutorialDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    stepsContainer: {
      width: '100%',
      marginBottom: 24,
    },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 14,
      marginBottom: 8,
      backgroundColor: isDark ? '#1a1a1a' : '#f8f8f8',
    },
    stepItemActive: {
      backgroundColor: ACCENT + '12',
      borderWidth: 1,
      borderColor: ACCENT + '40',
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#333' : '#ddd',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      marginTop: 2,
    },
    stepNumberDone: {
      backgroundColor: ACCENT,
    },
    stepNumberText: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#aaa' : '#666',
    },
    stepTextContainer: { flex: 1 },
    stepTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    stepDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    grantBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 60,
      gap: 8,
      width: '100%',
      marginBottom: 12,
    },
    grantBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    checkBtn: {
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 60,
      borderWidth: 2,
      borderColor: ACCENT,
      width: '100%',
      alignItems: 'center',
      marginBottom:50
    },
    checkBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: ACCENT,
    },

    // Total Banner
    totalBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 20,
      marginBottom: 8,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderRadius: 58,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
    },
    totalLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    totalLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    totalValue: {
      fontSize: 25,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    totalApps: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },

    infoText: {
      fontSize: 12,
      color: colors.textTertiary,
      paddingHorizontal: 24,
      marginBottom: 12,
    },

    // App List
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 100,
    },
    appItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 56,
      marginBottom: 8,
      backgroundColor: isDark ? '#1a1a1a' : '#f8f8f8',
    },
    appItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    appIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      marginRight: 12,
    },
    appIconPlaceholder: {
      backgroundColor: isDark ? '#333' : '#e0e0e0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    appTextContainer: { flex: 1 },
    appName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    appPackage: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 1,
    },
    cacheLine: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 3,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 100,
    },
    loadingText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 12,
      fontWeight: '600',
    },

    // Empty
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 12,
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });

export default AppCacheManager;
