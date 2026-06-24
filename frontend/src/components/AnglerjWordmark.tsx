import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme";
import { AnglerjMark } from "./AnglerjMark";

type Props = {
  height?: number; // height of mark; text scales relative to it
  color?: string; // brand hook color
  textColor?: string; // wordmark color
  showTagline?: boolean;
};

/**
 * Inline wordmark: "angler" text + hook-J mark visually flush, so the hook
 * reads as the lowercase "j" at the end of the word. Tagline optional.
 */
export function AnglerjWordmark({
  height = 56,
  color = COLORS.brand,
  textColor = COLORS.onSurface,
  showTagline = false,
}: Props) {
  // The "angler" text is sized so its cap height roughly matches the
  // hook stem height — the descending hook gives the natural "j".
  const textSize = Math.round(height * 0.62);
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text
          style={[
            styles.word,
            { color: textColor, fontSize: textSize, lineHeight: textSize * 1.05 },
          ]}
        >
          angler
        </Text>
        <AnglerjMark size={height} color={color} style={styles.markAdjust} />
      </View>
      {showTagline ? (
        <Text style={[styles.tagline, { color: color, fontSize: Math.max(10, height * 0.16) }]}>
          SMARTER DECISIONS. MORE BITES.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  word: {
    fontWeight: "300",
    letterSpacing: -1,
    fontFamily: undefined, // platform default rounded sans (Avenir Next on iOS, sans-serif on Android)
    includeFontPadding: false as any,
  },
  markAdjust: {
    // Pull the hook in tight to the "r" so it reads as a single word.
    marginLeft: -4,
    marginTop: 2,
  },
  tagline: {
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 6,
  },
});

export default AnglerjWordmark;
