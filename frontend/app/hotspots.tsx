import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, getSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";
import { distM, useUnits } from "@/src/units";

const ICONS: Record<string, any> = {
  pier: "boat-outline",
  jetty: "shield-outline",
  "boat ramp": "navigate-outline",
  marina: "boat",
  beach: "sunny-outline",
  "fishing spot": "fish-outline",
  spot: "location-outline",
};

export default function HotspotsScreen() {
  const router = useRouter();
  const { units } = useUnits();
  const [spots, setSpots] = useState<any[]>([]);
  const [loc, setLoc] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cur = await getSavedLocation();
    if (!cur) { setLoading(false); return; }
    setLoc(cur.display);
    try {
      const r = await api.hotspots(cur.lat, cur.lon, 10);
      setSpots(r.spots);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-hotspots" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Nearby Fishing Hotspots</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
        <Text style={styles.sub}>{loc} · 10 km radius</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.xl }} />
      ) : spots.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No hotspots found nearby</Text>
          <Text style={styles.emptySub}>Try a coastal location to see piers, jetties, marinas, and more.</Text>
        </View>
      ) : (
        <FlatList
          testID="hotspots-list"
          data={spots}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`hotspot-${item.id}`}>
              <View style={styles.iconBubble}>
                <Ionicons name={ICONS[item.kind] || "location-outline"} size={20} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spotName}>{item.name}</Text>
                <Text style={styles.spotKind}>{item.kind}</Text>
              </View>
              <Text style={styles.spotDist}>{distM(item.distance_km * 1000, units)}</Text>
            </View>
          )}
        />
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
  sub: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "600" },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.md },
  emptySub: { fontSize: TYPE.sm, color: COLORS.textMuted, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md,
    padding: SPACING.lg, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconBubble: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  spotName: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  spotKind: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2, textTransform: "capitalize" },
  spotDist: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.brand },
});
