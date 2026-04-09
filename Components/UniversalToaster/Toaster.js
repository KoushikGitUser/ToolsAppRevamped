import {
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { toastEmitter } from "../../Services/toast";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../Services/ThemeContext";

const TYPE_COLORS = {
  success: "#03B32F",
  alert: "#FFA412",
  info: "#4A90D9",
  normal: "#888888",
  error: "#D00B0B",
};

const Toaster = () => {
  const [toast, setToast] = useState({
    visible: false,
    title: "",
    description: "",
    type: "success",
    duration: 3000,
  });

  const { colors } = useTheme();

  const slideAnim = useRef(new Animated.Value(-170)).current;
  const hideTimer = useRef(null);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dy) > 5;
      },

      onPanResponderMove: (_, gesture) => {
        if (gesture.dy < 0) {
          slideAnim.setValue(55 + gesture.dy);
        }
      },

      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -40) {
          Animated.timing(slideAnim, {
            toValue: -170,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setToast((t) => ({ ...t, visible: false }));
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 55,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    const listener = (data) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);

      const duration = data.duration || 3000;

      setToast({
        visible: true,
        title: data.title || "",
        description: data.description || "",
        type: data.type || "success",
        duration,
      });

      slideAnim.setValue(-170);

      Animated.timing(slideAnim, {
        toValue: 55,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        hideTimer.current = setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -170,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setToast((t) => ({ ...t, visible: false }));
          });
        }, duration);
      });
    };

    const off = toastEmitter.on("SHOW_TOAST", listener);
    return () => off();
  }, []);

  if (!toast.visible) return null;

  const typeColor = TYPE_COLORS[toast.type] || TYPE_COLORS.normal;

  const renderIcon = () => {
    if (toast.type === "success") {
      return <MaterialIcons name="check-circle" size={22} color={typeColor} style={{ marginTop: 3 }} />;
    } else if (toast.type === "alert") {
      return <Ionicons name="warning" size={22} color={typeColor} style={{ marginTop: 3 }} />;
    } else if (toast.type === "info") {
      return <Ionicons name="information-circle" size={22} color={typeColor} style={{ marginTop: 3 }} />;
    } else if (toast.type === "normal") {
      return <Ionicons name="checkmark-circle" size={22} color={typeColor} style={{ marginTop: 3 }} />;
    } else {
      return <Ionicons name="close-circle" size={22} color={typeColor} style={{ marginTop: 3 }} />;
    }
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toast,
        {
          backgroundColor: colors.card,
          borderColor: colors.border2,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.indicator, { backgroundColor: typeColor }]} />
      {renderIcon()}
      <Animated.View style={styles.textContainer}>
        <Text style={[styles.textTitle, { color: colors.textPrimary }]}>{toast.title}</Text>
        {toast.description !== "" && (
          <Text style={[styles.textDesc, { color: colors.sectionSubtitle }]}>{toast.description}</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  toast: {
    width: width - 40,
    position: "absolute",
    left: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 9999999999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  indicator: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
  },
  textTitle: {
    fontWeight: "700",
    fontSize: 15,
  },
  textDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});

export default Toaster;
