// Centralized design tokens from /app/design_guidelines.json
export const COLORS = {
  surface: "#FBFBF9",
  onSurface: "#1C1D1C",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#EAE9E4",
  onSurfaceTertiary: "#40423F",
  surfaceInverse: "#2B2D2B",
  onSurfaceInverse: "#FBFBF9",
  brand: "#425E4A",
  brandPrimary: "#425E4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#C96E4C",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#D9E0D9",
  onBrandTertiary: "#2E4234",
  success: "#3C6146",
  warning: "#D18E42",
  error: "#B3473E",
  info: "#4A5459",
  onInfo: "#FFFFFF",
  border: "#E1E0DA",
  borderStrong: "#BDBBBA",
  divider: "#EBEAE5",
  textMuted: "#6B6E6A",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const TYPE = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 40,
};

export function verdictColor(verdict: string): string {
  switch (verdict) {
    case "Excellent":
      return COLORS.success;
    case "Good":
      return COLORS.brand;
    case "Fair":
      return COLORS.warning;
    case "Poor":
      return COLORS.error;
    default:
      return COLORS.info;
  }
}
