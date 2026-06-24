// Anglerj brand tokens — official design system reference.
// Aligned to Anglerj Design System (June 2026).
export const COLORS = {
  // Surfaces
  surface: "#050B1C",          // Deep Ocean — primary background
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1B2330", // Dark Navy — cards & input fields
  surfaceTertiary: "#252E3C",  // chips, raised states
  onSurfaceTertiary: "#A7AEB8",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#1B2330",

  // Brand
  brand: "#1EA7FF",            // Primary Blue
  brandPrimary: "#1EA7FF",
  brandGradientStart: "#2FB6FF", // brighter top of gradient
  brandGradientEnd: "#1487E5",   // darker bottom of gradient
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#00E0C2",   // Accent Cyan — success / AI highlights
  onBrandSecondary: "#0F1620",
  brandTertiary: "#0F2A40",    // muted blue-tinted card background
  onBrandTertiary: "#9FD4FF",

  // Status
  success: "#34D399",
  warning: "#F2C067",
  error: "#F38B82",
  info: "#A7AEB8",
  onInfo: "#1B2330",

  // Lines / dividers
  border: "#2A3343",
  borderStrong: "#3B4458",
  borderBlue: "#1B3A55",       // subtle blue-tinted border for inputs
  divider: "#252E3C",
  textMuted: "#A7AEB8",        // Silver — secondary text
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
