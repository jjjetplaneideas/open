import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, getSavedLocation, Species } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function FishScreen() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [season, setSeason] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locName, setLocName] = useState<string>("");
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setError("");
    const loc = await getSavedLocation();
    if (!loc) {
      setLoading(false);
      return;
    }
    setLocName(loc.display);
    try {
      const r = await api.species(loc.lat, loc.lon, loc.display);
      setSpecies(r.species || []);
      setSeason(r.season);
    } catch (e: any) {
      setError(e?.message || "Unable to load species");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center} testID="fish-loading">
        <ActivityIndicator color={COLORS.brand} />
        <Text style={{ marginTop: SPACING.md, color: COLORS.textMuted }}>
          Asking the almanac…
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Seasonal Species</Text>
        <Text style={styles.sub}>
          {locName ? `${locName}` : "Set a location"}
          {season ? ` · ${capitalize(season)}` : ""}
        </Text>
      </View>
      <ScrollView
        testID="fish-scroll"
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
        }
      >
        {error ? (
          <Text style={{ color: COLORS.error, marginBottom: SPACING.md }}>{error}</Text>
        ) : null}
        {species.length === 0 && !error ? (
          <View style={styles.emptyBox} testID="fish-empty">
            <Ionicons name="fish-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No species data yet</Text>
            <Text style={styles.emptySub}>Pull to refresh or set a location.</Text>
          </View>
        ) : null}
        <View style={styles.grid}>
          {species.map((s, i) => (
            <View key={`${s.common_name}-${i}`} style={styles.card} testID={`species-${i}`}>
              <View style={styles.iconBubble}>
                <Ionicons name="fish" size={28} color={COLORS.brand} />
              </View>
              <Text style={styles.name} numberOfLines={2}>
                {s.common_name}
              </Text>
              <Text style={styles.sci} numberOfLines={1}>
                {s.scientific_name}
              </Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}>
                  <Ionicons name="time-outline" size={11} color={COLORS.onInfo} />
                  <Text style={styles.tagText}>{s.best_time}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: activityColor(s.activity_level) }]}>
                  <Text style={[styles.tagText, { color: "#FFF" }]}>{s.activity_level}</Text>
                </View>
              </View>
              <Text style={styles.habitat} numberOfLines={2}>
                {s.habitat}
              </Text>
              <View style={styles.tipRow}>
                <Ionicons name="bulb-outline" size={14} color={COLORS.brandSecondary} />
                <Text style={styles.tip} numberOfLines={3}>
                  {s.best_technique}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function activityColor(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("hot")) return COLORS.error;
  if (l.includes("warm")) return COLORS.brandSecondary;
  if (l.includes("cool")) return COLORS.brand;
  if (l.includes("cold")) return COLORS.info;
  return COLORS.info;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  h1: { fontSize: TYPE.xxl, fontWeight: "800", color: COLORS.onSurface },
  sub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  name: { fontSize: TYPE.lg, fontWeight: "800", color: COLORS.onSurface },
  sci: { fontSize: TYPE.sm, fontStyle: "italic", color: COLORS.textMuted, marginTop: 2 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.md },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.surfaceTertiary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: COLORS.onSurfaceTertiary },
  habitat: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.md, lineHeight: 18 },
  tipRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  tip: { flex: 1, fontSize: TYPE.sm, color: COLORS.onSurface, lineHeight: 18 },
  emptyBox: { alignItems: "center", justifyContent: "center", padding: SPACING.xxl },
  emptyTitle: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.md },
  emptySub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
});
