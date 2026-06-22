import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, getSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function RegulationsScreen() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loc, setLoc] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cur = await getSavedLocation();
    if (!cur) { setLoading(false); return; }
    setLoc(cur.display);
    try {
      const r = await api.regulations({ lat: cur.lat, lon: cur.lon, location_name: cur.display });
      setText(r.summary);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-regs" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Fishing Regulations</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        <Text style={styles.sub}>{loc}</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.xl }} />
        ) : (
          <Text style={styles.body} testID="regulations-body">{text}</Text>
        )}
        <View style={styles.disclaimer}>
          <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
          <Text style={styles.disclaimerText}>
            Regulations are provided for convenience only. Official state and federal agencies remain
            the authoritative source. Always verify current regulations before harvesting fish.
          </Text>
        </View>
      </ScrollView>
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
  sub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginBottom: SPACING.md, fontWeight: "600" },
  body: { fontSize: TYPE.base, color: COLORS.onSurface, lineHeight: 22 },
  disclaimer: {
    flexDirection: "row", gap: SPACING.sm,
    marginTop: SPACING.xl, padding: SPACING.md,
    backgroundColor: "#FBEFC8", borderRadius: RADIUS.md,
  },
  disclaimerText: { flex: 1, fontSize: TYPE.sm, color: COLORS.onSurfaceTertiary, lineHeight: 18 },
});
