import React, { useCallback, useRef } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GAP = 10;
const COLUMNS = 2;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const ITEM_HEIGHT = ITEM_WIDTH * 0.75;

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.5 };

const getSlotPosition = (slotIdx) => {
  'worklet';
  const row = Math.floor(slotIdx / COLUMNS);
  const col = slotIdx % COLUMNS;
  return {
    x: GRID_PADDING + col * (ITEM_WIDTH + GAP),
    y: row * (ITEM_HEIGHT + GAP),
  };
};

const DragItem = ({
  item,
  index,
  activeIndex,
  itemCount,
  onDrop,
  borderColor,
  badgeColor,
  badgeTextColor,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      'worklet';
      activeIndex.value = index;
      scale.value = withSpring(1.08, SPRING_CONFIG);
      zIndex.value = 100;
    })
    .onUpdate((event) => {
      'worklet';
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      // Find which slot the item was dropped on
      const myPos = getSlotPosition(index);
      const fingerX = myPos.x + event.translationX + ITEM_WIDTH / 2;
      const fingerY = myPos.y + event.translationY + ITEM_HEIGHT / 2;

      let targetSlot = index; // default: drop back to own slot
      let closestDist = Infinity;
      for (let s = 0; s < itemCount; s++) {
        const sp = getSlotPosition(s);
        const cx = sp.x + ITEM_WIDTH / 2;
        const cy = sp.y + ITEM_HEIGHT / 2;
        const dist = Math.sqrt((fingerX - cx) ** 2 + (fingerY - cy) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          targetSlot = s;
        }
      }

      // Snap back immediately
      translateX.value = 0;
      translateY.value = 0;
      scale.value = withSpring(1, SPRING_CONFIG);
      zIndex.value = 0;
      activeIndex.value = -1;

      // Only swap if dropped on a different slot
      if (targetSlot !== index) {
        runOnJS(onDrop)(index, targetSlot);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const pos = getSlotPosition(index);
    const isActive = activeIndex.value === index;

    return {
      position: 'absolute',
      width: ITEM_WIDTH,
      height: ITEM_HEIGHT,
      left: pos.x,
      top: pos.y,
      transform: [
        { translateX: isActive ? translateX.value : 0 },
        { translateY: isActive ? translateY.value : 0 },
        { scale: scale.value },
      ],
      zIndex: zIndex.value,
      elevation: isActive ? 10 : 0,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>
        <View style={[styles.itemContainer, { borderColor }]}>
          <Image
            source={{ uri: item.thumbUri || item.uri }}
            style={styles.itemImage}
            resizeMode="cover"
          />
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>
              {index + 1}
            </Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const DragSortGrid = ({
  images,
  onReorderDone,
  borderColor = '#555',
  badgeColor = '#000',
  badgeTextColor = '#fff',
}) => {
  const itemCount = images.length;
  const totalRows = Math.ceil(itemCount / COLUMNS);
  const containerHeight = totalRows * (ITEM_HEIGHT + GAP) - GAP + 20;

  const activeIndex = useSharedValue(-1);

  const handleDrop = useCallback((fromIndex, toIndex) => {
    // Simple swap: only the picked image and the target image exchange places
    const newImages = [...images];
    const temp = newImages[fromIndex];
    newImages[fromIndex] = newImages[toIndex];
    newImages[toIndex] = temp;
    onReorderDone(newImages);
  }, [images, onReorderDone]);

  return (
    <View style={{ height: containerHeight, position: 'relative' }}>
      {images.map((item, index) => (
        <DragItem
          key={`drag-${item.uri}-${index}`}
          item={item}
          index={index}
          activeIndex={activeIndex}
          itemCount={itemCount}
          onDrop={handleDrop}
          borderColor={borderColor}
          badgeColor={badgeColor}
          badgeTextColor={badgeTextColor}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 5,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 46,
    height: 30,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    elevation:10
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '900',
  },
});

export default DragSortGrid;
