import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { COLORS, SPACING, TYPE } from "@/src/theme";

type MoonData = {
  phase_name: string;
  illumination_pct: number;
  moonrise?: string | null;
  moonset?: string | null;
  transit?: string | null;
  antitransit?: string | null;
  solunar_score: number;
};

export default function MoonCard({ moon }: { moon: MoonData }) {
  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const explanation =
    moon.solunar_score >= 80
      ? "Near new/full moon — peak feeding activity expected at major windows."
      : moon.solunar_score >= 60
      ? "Solid solunar phase — bite should pick up near moonrise and moonset."
      : "Quarter moon — solunar pull is weakest right now, so focus on light/dark transitions instead.";

  return (
    <View style={styles.wrap} testID="moon-card">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Moon & Solunar</Text>
        <View style={styles.scoreChip}>
          <Text style={styles.scoreText}>Solunar {moon.solunar_score}</Text>
        </View>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.moonGraphic}>
          <Svg width={84} height={84}>
            <Circle cx={42} cy={42} r={36} fill={COLORS.surfaceInverse} />
            <Path
              d={moonShadowPath(42, 42, 36, moon.illumination_pct, moon.phase_name)}
              fill="#FBEFC8"
            />
          </Svg>
          <Text style={styles.phase}>{moon.phase_name}</Text>
          <Text style={styles.illum}>{moon.illumination_pct.toFixed(0)}% lit</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Row label="Moonrise" value={fmt(moon.moonrise)} />
          <Row label="Moonset" value={fmt(moon.moonset)} />
          <Row label="Overhead" value={fmt(moon.transit)} />
          <Row label="Underfoot" value={fmt(moon.antitransit)} />
        </View>
      </View>

      <Text style={styles.note}>{explanation}</Text>
    </View>
  );
}

function moonShadowPath(cx: number, cy: number, r: number, illum: number, phase: string): string {
  // Approximate a moon phase by drawing a lit crescent.
  const waxing = phase.toLowerCase().includes("waxing") || phase === "First Quarter" || phase === "New Moon";
  const i = Math.max(0, Math.min(100, illum)) / 100;
  // Use an ellipse to clip
  // ratio: 0 = thin crescent, 1 = full
  const ex = r * (1 - 2 * i);
  const sweep = waxing ? 1 : 0;
  // Outer arc (right side or left side lit)
  const startX = cx, startY = cy - r;
  const endX = cx, endY = cy + r;
  const outerSweep = waxing ? 1 : 0;
  const path = `M ${startX} ${startY}
    A ${r} ${r} 0 0 ${outerSweep} ${endX} ${endY}
    A ${Math.abs(ex)} ${r} 0 0 ${ex < 0 ? 1 - sweep : sweep} ${startX} ${startY}
    Z`;
  return path;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  scoreChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: COLORS.brandTertiary },
  scoreText: { color: COLORS.onBrandTertiary, fontWeight: "800", fontSize: 11 },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: SPACING.lg, marginTop: SPACING.md },
  moonGraphic: { alignItems: "center", width: 96 },
  phase: { fontSize: 11, fontWeight: "700", color: COLORS.onSurface, marginTop: 6, textAlign: "center" },
  illum: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "600" },
  rowValue: { fontSize: TYPE.sm, color: COLORS.onSurface, fontWeight: "700" },
  note: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.md, lineHeight: 18 },
});
