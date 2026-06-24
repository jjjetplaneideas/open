import React from "react";
import { StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";

import { COLORS, SPACING, TYPE } from "../theme";

type Props = {
  text?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Tagline bar per Anglerj Design System reference — a pill-shaped surface
 * with subtle blue-tinted border displaying the brand tagline.
 */
export function TaglineBar({ text = "SMARTER DECISIONS. MORE BITES.", style }: Props) {
  return (
    <View style={[styles.bar, style]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30, 167, 255, 0.04)",
  },
  text: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
    textAlign: "center",
  },
});

export default TaglineBar;
