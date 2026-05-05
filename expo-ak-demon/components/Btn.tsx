import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { Pressable, Text, StyleSheet, PressableProps, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

// Wrap the standard Pressable so it can accept Reanimated styles
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BtnProps extends PressableProps {
  text?: string;
  icon?: React.ReactNode;
  radius?: number;
  width?: number | "auto" | `${number}%`;
  isFullWidth?: boolean;
  padding?: number;
  margin?: number;
  backgroundColor?: string;
  textColor?: string;
}

export const Btn: React.FC<BtnProps> = ({
  text,
  icon,
  radius = 8,
  width,
  isFullWidth = false,
  padding = 16,
  margin = 0,
  backgroundColor, // Default iOS blue
  textColor,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  // Shared value for the scale animation
  const scale = useSharedValue(1);
  const { colors } = useTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.6 : 1, // Visually dim the button if disabled
  }));

  const handlePressIn = (e: any) => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 200 });
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    if (onPressOut) onPressOut(e);
  };

  // Construct dynamic layout styles based on props
  const dynamicStyles: ViewStyle = {
    borderRadius: radius,
    width: isFullWidth ? "100%" : width,
    padding,
    margin,
    backgroundColor: backgroundColor || colors.primary,
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.button, dynamicStyles, animatedStyle, style as any]}
      {...rest}
    >
      {icon && icon}
      {text && <Text style={[styles.text, { color: textColor || colors.primaryTxt }]}>{text}</Text>}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8, // Clean spacing if both icon and text are provided
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
