import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, RADIUS, SPACING, TYPE } from "../theme";

type Props = {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Primary CTA per Anglerj Design System.
 * Linear gradient from brandGradientStart → brandGradientEnd, white text, 16px radius.
 */
export function GradientButton({ label, onPress, loading, disabled, style, testID }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.outer,
        style,
        pressed && !isDisabled ? { opacity: 0.9 } : null,
        isDisabled ? { opacity: 0.5 } : null,
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={[COLORS.brandGradientStart, COLORS.brandGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.onBrandPrimary} />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  gradient: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: COLORS.onBrandPrimary,
    fontWeight: "700",
    fontSize: TYPE.lg,
    letterSpacing: 0.3,
  },
});

export default GradientButton;
