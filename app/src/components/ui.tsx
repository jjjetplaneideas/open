/** Small, touch-first UI primitives shared across screens. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, font, radius, space } from '../theme/theme';

/**
 * Minimal glyph "icon" set. Uses unicode so the prototype needs no icon font.
 * Swap for @expo/vector-icons in production.
 */
const GLYPHS: Record<string, string> = {
  folder: '▸',
  folderOpen: '▾',
  file: '·',
  ai: '✦',
  diff: '⇄',
  terminal: '›_',
  commit: '⎙',
  settings: '⚙',
  editor: '✎',
  explorer: '☰',
  search: '⌕',
  close: '✕',
  check: '✓',
  branch: '⑂',
  play: '▷',
  palette: '⌘',
  back: '‹',
  push: '↑',
  plus: '+',
};

export function Icon({
  name,
  size = font.size.md,
  color = colors.text,
}: {
  name: keyof typeof GLYPHS | string;
  size?: number;
  color?: string;
}) {
  return <Text style={{ fontSize: size, color }}>{GLYPHS[name] ?? '•'}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: '#0B0D10' },
    ghost: { bg: colors.elevated, fg: colors.text },
    danger: { bg: colors.danger, fg: '#0B0D10' },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'accent' | 'success' | 'danger' }) {
  const bg = {
    neutral: colors.surfaceAlt,
    accent: colors.accentSoft,
    success: colors.diffAddBg,
    danger: colors.diffDelBg,
  }[tone];
  const fg = {
    neutral: colors.textMuted,
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: font.minTapTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: font.size.md, fontWeight: '600' },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: font.size.xs, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  headerTitle: { color: colors.text, fontSize: font.size.lg, fontWeight: '700' },
  headerSubtitle: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
});
