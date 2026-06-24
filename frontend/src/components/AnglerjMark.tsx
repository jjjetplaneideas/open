import React from "react";
import { Image, ImageStyle, StyleProp, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICON = require("../../assets/images/anglerj_icon.png");

type Props = {
  size?: number;
  /** Optional override style applied to the inner Image. */
  style?: StyleProp<ImageStyle>;
};

/**
 * Official Anglerj brand mark — circular dark-navy badge with the
 * blue fish-hook "j" icon. Backed by /assets/images/anglerj_icon.png
 * which was generated from the master brand artwork supplied by the
 * user (1254×1254 master → 512×512 icon crop).
 */
export function AnglerjMark({ size = 88, style }: Props) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={ICON}
        style={[{ width: size, height: size, resizeMode: "contain" }, style]}
      />
    </View>
  );
}

export default AnglerjMark;
