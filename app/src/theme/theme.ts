/**
 * Dark-first design tokens for the IDE.
 *
 * The palette is an original, neutral "graphite + electric" scheme — it does
 * not reproduce any third-party editor's brand colors or visual identity.
 */
export const colors = {
  // Surfaces (darkest -> lightest)
  bg: '#0B0D10',
  surface: '#121519',
  surfaceAlt: '#171B21',
  elevated: '#1E232B',
  border: '#262C35',

  // Text
  text: '#E6EAF0',
  textMuted: '#9AA4B2',
  textFaint: '#5B6675',

  // Brand / accent (electric indigo-cyan, original)
  accent: '#5B8DEF',
  accentSoft: '#23304A',
  accent2: '#37E0C8',

  // Semantic
  success: '#3FB68B',
  warning: '#E0A23A',
  danger: '#E5575B',

  // Diff
  diffAddBg: '#10271C',
  diffAddText: '#7FE0A8',
  diffDelBg: '#2A1517',
  diffDelText: '#F0989B',

  // Syntax (used by the lightweight highlighter)
  synKeyword: '#7AA2F7',
  synString: '#9ECE6A',
  synNumber: '#FF9E64',
  synComment: '#5B6675',
  synFunction: '#37E0C8',
  synType: '#E0AF68',
  synPunct: '#9AA4B2',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const font = {
  mono: 'Menlo',
  // Tap targets >= 44pt per Apple HIG.
  minTapTarget: 44,
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
} as const;

/** A tablet/iPad breakpoint: above this width we use the three-pane layout. */
export const TABLET_BREAKPOINT = 760;

export type Colors = typeof colors;
