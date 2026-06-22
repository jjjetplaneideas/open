import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, getOrCreateUserId } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function AnalyticsScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const uid = await getOrCreateUserId();
    try {
      const r = await api.catchAnalytics(uid);
      setData(r);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-analytics" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Catch Analytics</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.xl }} />
      ) : !data || data.total === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="analytics-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No catches logged yet</Text>
          <Text style={styles.emptySub}>Log a few catches and we'll surface your personal fishing patterns here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }}>
          <Text style={styles.totalText}>{data.total} catches logged</Text>
          {data.insights.map((ins: any, i: number) => (
            <View key={i} style={styles.card} testID={`insight-${i}`}>
              <Text style={styles.cardLabel}>{ins.title}</Text>
              <Text style={styles.cardText}>{ins.text}</Text>
            </View>
          ))}
          {data.by_species?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>By species</Text>
              {data.by_species.map((s: any) => (
                <View key={s.name} style={styles.speciesRow}>
                  <Text style={styles.speciesName}>{s.name}</Text>
                  <Text style={styles.speciesCount}>{s.count}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  title: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.md },
  emptySub: { fontSize: TYPE.sm, color: COLORS.textMuted, textAlign: "center" },
  totalText: { fontSize: TYPE.base, color: COLORS.textMuted, fontWeight: "700" },
  card: {
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  cardLabel: { fontSize: 11, fontWeight: "800", color: COLORS.brand, letterSpacing: 1.2, marginBottom: SPACING.xs },
  cardText: { fontSize: TYPE.base, color: COLORS.onSurface, lineHeight: 22 },
  speciesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.divider },
  speciesName: { fontSize: TYPE.sm, color: COLORS.onSurface, fontWeight: "600" },
  speciesCount: { fontSize: TYPE.sm, color: COLORS.brand, fontWeight: "800" },
});
