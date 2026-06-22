import { StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export type Contributor = { key: string; label: string; delta: number; note: string };

export default function ScoreBreakdown({ contributors }: { contributors: Contributor[] }) {
  const positives = contributors.filter((c) => c.delta > 0);
  const negatives = contributors.filter((c) => c.delta < 0);
  return (
    <View style={styles.wrap} testID="score-breakdown">
      <Text style={styles.title}>Score Breakdown</Text>
      {positives.length > 0 && (
        <>
          <Text style={[styles.sub, { color: COLORS.success }]}>Positive Contributors</Text>
          {positives.map((c) => (
            <Row key={c.key} c={c} positive />
          ))}
        </>
      )}
      {negatives.length > 0 && (
        <>
          <Text style={[styles.sub, { color: COLORS.error, marginTop: SPACING.md }]}>
            Negative Contributors
          </Text>
          {negatives.map((c) => (
            <Row key={c.key} c={c} positive={false} />
          ))}
        </>
      )}
    </View>
  );
}

function Row({ c, positive }: { c: Contributor; positive: boolean }) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.deltaPill,
          { backgroundColor: positive ? COLORS.brandTertiary : "#FBEAE7" },
        ]}
      >
        <Text
          style={[
            styles.deltaText,
            { color: positive ? COLORS.brand : COLORS.error },
          ]}
        >
          {c.delta > 0 ? `+${c.delta}` : c.delta}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{c.label}</Text>
        <Text style={styles.note}>{c.note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface, marginBottom: SPACING.sm },
  sub: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: SPACING.xs, marginTop: SPACING.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: 6 },
  deltaPill: {
    width: 48, paddingVertical: 4, borderRadius: RADIUS.sm,
    alignItems: "center", justifyContent: "center",
  },
  deltaText: { fontSize: TYPE.sm, fontWeight: "800" },
  label: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.onSurface },
  note: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
});
