import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPE, verdictColor } from "@/src/theme";

type Hour = {
  time: string;
  score: number;
  verdict: "Excellent" | "Good" | "Fair" | "Poor";
  weather_text: string;
  in_major: boolean;
  in_minor: boolean;
  tide_direction: string | null;
};

export default function HourlyBiteForecast({
  baseUrl, lat, lon,
}: { baseUrl: string; lat: number; lon: number }) {
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}/api/forecast/hourly?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHours(d.hours); })
      .catch((e) => { if (!cancelled) setError(String(e?.message || e)); });
    return () => { cancelled = true; };
  }, [baseUrl, lat, lon]);

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric" }).replace(":00", "");
    } catch { return iso; }
  };

  return (
    <View style={styles.wrap} testID="hourly-bite-forecast">
      <View style={styles.headRow}>
        <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
          <Ionicons name="time-outline" size={18} color={COLORS.brand} />
          <Text style={styles.title}>24-Hour Bite Forecast</Text>
        </View>
      </View>
      {!hours && !error && <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.md }} />}
      {error && <Text style={styles.err}>{error}</Text>}
      {hours && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACING.sm, paddingVertical: SPACING.sm }}
          >
            {hours.map((h, i) => {
              const c = verdictColor(h.verdict);
              const heightPct = Math.max(8, h.score) / 100;
              return (
                <View key={`${h.time}-${i}`} style={styles.col}>
                  <Text style={styles.score}>{h.score}</Text>
                  <View style={styles.barWrap}>
                    <View style={[styles.bar, { backgroundColor: c, height: `${heightPct * 100}%` }]} />
                  </View>
                  <Text style={styles.timeTxt}>{fmt(h.time)}</Text>
                  {h.in_major ? (
                    <View style={[styles.dot, { backgroundColor: COLORS.brand }]} />
                  ) : h.in_minor ? (
                    <View style={[styles.dot, { backgroundColor: COLORS.brandSecondary }]} />
                  ) : (
                    <View style={[styles.dot, { backgroundColor: "transparent" }]} />
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.legend}>
            <Legend color={COLORS.success} text="Excellent" />
            <Legend color={COLORS.brand} text="Good" />
            <Legend color={COLORS.warning} text="Fair" />
            <Legend color={COLORS.error} text="Poor" />
            <Legend color={COLORS.brand} text="● Major" dot />
            <Legend color={COLORS.brandSecondary} text="● Minor" dot />
          </View>
        </>
      )}
    </View>
  );
}

function Legend({ color, text, dot }: { color: string; text: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {!dot && <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />}
      <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  col: { alignItems: "center", width: 32 },
  score: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, marginBottom: 4 },
  barWrap: {
    width: 18, height: 64, backgroundColor: COLORS.surfaceTertiary,
    borderRadius: 4, justifyContent: "flex-end", overflow: "hidden",
  },
  bar: { width: "100%", borderRadius: 4 },
  timeTxt: { fontSize: 10, color: COLORS.onSurface, fontWeight: "600", marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md, marginTop: SPACING.sm },
  err: { color: COLORS.error, fontSize: TYPE.sm, marginTop: SPACING.sm },
});
