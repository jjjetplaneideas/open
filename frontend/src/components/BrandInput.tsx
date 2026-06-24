import React, { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, RADIUS, SPACING, TYPE } from "../theme";

type Props = TextInputProps & {
  /** Ionicon name shown on the left of the input. */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** When true, renders an eye toggle on the right for show/hide password. */
  togglePassword?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Anglerj brand input field per Design System reference.
 *  - background: COLORS.surfaceSecondary (#1B2330)
 *  - subtle blue-tinted border (COLORS.borderBlue)
 *  - leading blue Ionicon
 *  - 16px corner radius
 */
export const BrandInput = forwardRef<TextInput, Props>(function BrandInput(
  { iconName, togglePassword, containerStyle, secureTextEntry, style, ...rest },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const showSecure = togglePassword ? hidden : !!secureTextEntry;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {iconName ? (
        <View style={styles.icon}>
          <Ionicons name={iconName} size={20} color={COLORS.brand} />
        </View>
      ) : null}
      <TextInput
        ref={ref}
        secureTextEntry={showSecure}
        placeholderTextColor={COLORS.textMuted}
        style={[
          styles.input,
          { paddingLeft: iconName ? 46 : SPACING.lg, paddingRight: togglePassword ? 46 : SPACING.lg },
          style,
        ]}
        {...rest}
      />
      {togglePassword ? (
        <Pressable
          style={styles.eye}
          onPress={() => setHidden((h) => !h)}
          hitSlop={10}
        >
          <Ionicons
            name={hidden ? "eye-outline" : "eye-off-outline"}
            size={20}
            color={COLORS.brand}
          />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    position: "relative",
    justifyContent: "center",
  },
  icon: {
    position: "absolute",
    left: SPACING.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  eye: {
    position: "absolute",
    right: SPACING.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  input: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    color: COLORS.onSurface,
    fontSize: TYPE.lg,
    paddingVertical: 16,
  },
});

export default BrandInput;
