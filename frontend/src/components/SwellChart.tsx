import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Line } from "react-native-svg";
import { COLORS, SPACING, TYPE } from "@/src/theme";
import { heightM, UnitSystem } from "@/src/units";

export default function SwellChart({
  series,
  currentSwell,
  currentPeriod,
  currentDir,
  currentWave,
  units,
}: {
  series: { t: string; swell_h: number; wave_h?: number | null }[];
  currentSwell: number;
  currentPeriod: number | null;
  currentDir: number | null;
  currentWave: number | null;
  units: UnitSystem;
}) {
  const width = 320;
  const height = 120;
  const padX = 12;
  const padY = 16;

  const data = series.slice(0, 30);
  if (data.length < 2) return null;
  const heights = data.map((p) => p.swell_h);
  const minH = Math.min(0, ...heights);
  const maxH = Math.max(...heights);
  const range = Math.max(0.5, maxH - minH);

  const x = (i: number) => padX + (i / (data.length - 1)) * (width - 2 * padX);
  const y = (h: number) => padY + (1 - (h - minH) / range) * (height - 2 * padY);

  let d = `M ${x(0)} ${y(data[0].swell_h)}`;
  for (let i = 1; i < data.length; i++) {
    const px = x(i - 1);
    const py = y(data[i - 1].swell_h);
    const cx = x(i);
    const cy = y(data[i].swell_h);
    const midX = (px + cx) / 2;
    d += ` C ${midX} ${py}, ${midX} ${cy}, ${cx} ${cy}`;
  }
  const areaD = d + ` L ${x(data.length - 1)} ${height - padY} L ${x(0)} ${height - padY} Z`;

  const surfRating = currentSwell < 0.6 ? "Flat" : currentSwell < 1.2 ? "Small" : currentSwell < 2.0 ? "Solid" : "Heavy";

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Swell & Surf</Text>
        <View style={styles.ratingChip}>
          <Text style={styles.ratingText}>{surfRating}</Text>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <Kpi label="Swell" value={heightM(currentSwell, units)} />
        {currentPeriod != null && <Kpi label="Period" value={`${currentPeriod.toFixed(0)}s`} />}
        {currentDir != null && <Kpi label="Dir" value={degToCompass(currentDir)} />}
        {currentWave != null && <Kpi label="Wave" value={heightM(currentWave, units)} />}
      </View>

      <Svg width={width} height={height} style={{ marginTop: SPACING.sm }}>
        <Defs>
          <LinearGradient id="swellArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.brandSecondary} stopOpacity="0.35" />
            <Stop offset="1" stopColor={COLORS.brandSecondary} stopOpacity="0.04" />
          </LinearGradient>
        </Defs>
        <Path d={areaD} fill="url(#swellArea)" />
        <Path d={d} fill="none" stroke={COLORS.brandSecondary} strokeWidth={2} />
        <Line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={COLORS.divider} strokeWidth={1} />
      </Svg>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function degToCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  ratingChip: { backgroundColor: COLORS.brandTertiary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  ratingText: { fontSize: 11, fontWeight: "800", color: COLORS.onBrandTertiary },
  kpiRow: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.md, gap: SPACING.sm },
  kpi: { flex: 1, alignItems: "center", backgroundColor: COLORS.surfaceTertiary, borderRadius: 12, paddingVertical: 8 },
  kpiLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted },
  kpiValue: { fontSize: TYPE.base, fontWeight: "800", color: COLORS.onSurface, marginTop: 2 },
});
