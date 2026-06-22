import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export type SafetyData = { level: "Safe" | "Use Caution" | "Dangerous"; reasons: string[]; headline: string };

export default function SafetyBanner({ safety }: { safety: SafetyData }) {
  if (safety.level === "Safe") return null;
  const danger = safety.level === "Dangerous";
  const bg = danger ? "#5B1F1A" : "#7A4914";
  const accent = danger ? "#F38B82" : "#F2C067";
  return (
    <View testID="safety-banner" style={[styles.wrap, { backgroundColor: bg }]}>
      <View style={styles.headRow}>
        <Ionicons
          name={danger ? "warning" : "alert-circle"}
          size={20}
          color={accent}
        />
        <Text style={[styles.level, { color: accent }]}>{safety.level.toUpperCase()}</Text>
      </View>
      <Text style={styles.headline}>{safety.headline}</Text>
      {safety.reasons.map((r, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.bullet, { backgroundColor: accent }]} />
          <Text style={styles.reasonText}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    borderRadius: RADIUS.md, padding: SPACING.lg,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  level: { fontWeight: "800", fontSize: TYPE.sm, letterSpacing: 1.2 },
  headline: { color: "#FFF", fontSize: TYPE.lg, fontWeight: "800", marginTop: SPACING.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginTop: SPACING.sm },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  reasonText: { flex: 1, color: "rgba(255,255,255,0.92)", fontSize: TYPE.sm, lineHeight: 19 },
});
