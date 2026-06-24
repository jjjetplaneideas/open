import React from "react";
import { Image, ImageStyle, StyleProp, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WORDMARK = require("../../assets/images/anglerj_wordmark.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WORDMARK_TAGLINE = require("../../assets/images/anglerj_wordmark_tagline.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FULL = require("../../assets/images/anglerj_full.png");

type Props = {
  /** Height of the wordmark image. Width auto-scales to preserve aspect ratio. */
  height?: number;
  /** When true, includes the circular badge + wordmark + tagline (vertical lockup). */
  fullLockup?: boolean;
  /** Show the "SMARTER DECISIONS. MORE BITES." tagline (only used when fullLockup=false; the
   *  full image already has the tagline baked in). */
  showTagline?: boolean;
  style?: StyleProp<ImageStyle>;
};

// Native aspect ratios of the assets (px) — must match the cropper.
const WORDMARK_W = 1000;
const WORDMARK_H = 330;
const WORDMARK_TAGLINE_W = 1000;
const WORDMARK_TAGLINE_H = 495;
const FULL_W = 1254;
const FULL_H = 1254;

/**
 * Official Anglerj wordmark. Either:
 *   • horizontal "anglerj" wordmark (default), or
 *   • horizontal wordmark + tagline beneath ("SMARTER DECISIONS. MORE BITES."), or
 *   • full vertical lockup (badge + wordmark + tagline) when `fullLockup` is true.
 */
export function AnglerjWordmark({
  height = 56,
  fullLockup = false,
  showTagline = false,
  style,
}: Props) {
  if (fullLockup) {
    const w = height * (FULL_W / FULL_H);
    return (
      <View style={{ width: w, height }}>
        <Image source={FULL} style={[{ width: w, height, resizeMode: "contain" }, style]} />
      </View>
    );
  }
  if (showTagline) {
    const w = height * (WORDMARK_TAGLINE_W / WORDMARK_TAGLINE_H);
    return (
      <View style={{ width: w, height }}>
        <Image
          source={WORDMARK_TAGLINE}
          style={[{ width: w, height, resizeMode: "contain" }, style]}
        />
      </View>
    );
  }
  const w = height * (WORDMARK_W / WORDMARK_H);
  return (
    <View style={{ width: w, height }}>
      <Image source={WORDMARK} style={[{ width: w, height, resizeMode: "contain" }, style]} />
    </View>
  );
}

export default AnglerjWordmark;
