import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Line, Circle } from "react-native-svg";
import { COLORS, SPACING, TYPE } from "@/src/theme";
import { heightM, UnitSystem } from "@/src/units";

type TidePoint = { t: string; h: number };

export default function TideChart({
  series,
  extrema,
  current,
  direction,
  units,
}: {
  series: TidePoint[];
  extrema: { t: string; h: number; kind: "high" | "low" }[];
  current: number;
  direction: "incoming" | "outgoing";
  units: UnitSystem;
}) {
  const width = 320;
  const height = 140;
  const padX = 12;
  const padY = 18;

  // Slice to next ~24h
  const data = series.slice(0, 30);
  if (data.length < 2) return null;
  const heights = data.map((p) => p.h);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const range = Math.max(0.5, maxH - minH);

  const x = (i: number) => padX + (i / (data.length - 1)) * (width - 2 * padX);
  const y = (h: number) => padY + (1 - (h - minH) / range) * (height - 2 * padY);

  // Build path
  let d = `M ${x(0)} ${y(data[0].h)}`;
  for (let i = 1; i < data.length; i++) {
    const px = x(i - 1);
    const py = y(data[i - 1].h);
    const cx = x(i);
    const cy = y(data[i].h);
    const midX = (px + cx) / 2;
    d += ` C ${midX} ${py}, ${midX} ${cy}, ${cx} ${cy}`;
  }
  const areaD = d + ` L ${x(data.length - 1)} ${height - padY} L ${x(0)} ${height - padY} Z`;

  // Now line
  const now = new Date();
  let nowIdx = data.findIndex((p) => new Date(p.t) >= now);
  if (nowIdx < 0) nowIdx = 0;

  // Show next 4 extrema only
  const nextExtrema = extrema.filter((e) => new Date(e.t) >= now).slice(0, 4);

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
          <Text style={styles.title}>Tide</Text>
          <View style={[styles.dirChip, { backgroundColor: direction === "incoming" ? COLORS.brand : COLORS.brandSecondary }]}>
            <Text style={styles.dirText}>{direction === "incoming" ? "↑ Incoming" : "↓ Outgoing"}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.currentLabel}>Now</Text>
          <Text style={styles.currentVal}>{heightM(current, units)}</Text>
        </View>
      </View>

      <Svg width={width} height={height} style={{ marginTop: SPACING.sm }}>
        <Defs>
          <LinearGradient id="tideArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.brand} stopOpacity="0.35" />
            <Stop offset="1" stopColor={COLORS.brand} stopOpacity="0.04" />
          </LinearGradient>
        </Defs>
        <Path d={areaD} fill="url(#tideArea)" />
        <Path d={d} fill="none" stroke={COLORS.brand} strokeWidth={2} />
        {/* now indicator */}
        <Line x1={x(nowIdx)} y1={padY} x2={x(nowIdx)} y2={height - padY} stroke={COLORS.brandSecondary} strokeWidth={1.5} strokeDasharray="3 3" />
        <Circle cx={x(nowIdx)} cy={y(data[nowIdx].h)} r={5} fill={COLORS.brandSecondary} />
      </Svg>

      <View style={styles.extremaRow}>
        {nextExtrema.map((e, i) => (
          <View key={i} style={styles.extremaItem}>
            <Text style={styles.extLabel}>
              {e.kind === "high" ? "High" : "Low"}
            </Text>
            <Text style={styles.extTime}>{fmtTime(e.t)}</Text>
            <Text style={styles.extHeight}>{heightM(e.h, units)}</Text>
          </View>
        ))}
      </View>
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
  dirChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  dirText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  currentLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600" },
  currentVal: { fontSize: TYPE.lg, fontWeight: "800", color: COLORS.onSurface },
  extremaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.md, gap: SPACING.sm },
  extremaItem: { flex: 1, alignItems: "center", paddingVertical: SPACING.sm, backgroundColor: COLORS.surfaceTertiary, borderRadius: 12 },
  extLabel: { fontSize: 11, fontWeight: "700", color: COLORS.brand },
  extTime: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.onSurface, marginTop: 2 },
  extHeight: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
