import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { COLORS } from "../theme";

type Props = {
  size?: number;
  color?: string;
  style?: any;
};

/**
 * Anglerj brand mark — stylized lowercase "j" rendered as a fish hook.
 * Eyelet at the top, vertical stem, semi-circular hook curve at the bottom
 * with a small barb. Designed to mirror the official Anglerj logo guide.
 */
export function AnglerjMark({ size = 64, color = COLORS.brand, style }: Props) {
  // Internal viewBox aspect tuned so the eyelet fits exactly inside a square.
  // 60 (wide) × 100 (tall) keeps the hook's curve visually balanced.
  const w = size * 0.6;
  const h = size;
  return (
    <View style={style}>
      <Svg width={w} height={h} viewBox="0 0 60 100" fill="none">
        {/* Eyelet at top */}
        <Circle cx="42" cy="9" r="6" stroke={color} strokeWidth="4.5" fill="none" />
        {/* Vertical stem */}
        <Path
          d="M42 16 L42 64"
          stroke={color}
          strokeWidth="8.5"
          strokeLinecap="round"
        />
        {/* Hook curve sweeping left & up */}
        <Path
          d="M42 64 Q42 92 22 92 Q4 92 4 74 L4 70"
          stroke={color}
          strokeWidth="8.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Small barb on the inner curve */}
        <Path
          d="M12 72 L20 64"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

export default AnglerjMark;
