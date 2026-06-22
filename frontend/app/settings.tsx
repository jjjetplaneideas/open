import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { useUnits, UnitSystem } from "@/src/units";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { units, setUnits } = useUnits();

  const pick = async (u: UnitSystem) => {
    Haptics.selectionAsync();
    await setUnits(u);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-settings" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ padding: SPACING.lg, gap: SPACING.xl }}>
        <View>
          <Text style={styles.sectionLabel}>UNITS</Text>
          <View style={styles.segment}>
            <Pressable
              testID="units-metric"
              onPress={() => pick("metric")}
              style={[styles.segItem, units === "metric" && styles.segItemActive]}
            >
              <Text style={[styles.segText, units === "metric" && styles.segTextActive]}>
                Metric
              </Text>
              <Text style={[styles.segSub, units === "metric" && styles.segSubActive]}>
                °C · km/h · hPa · m · kg
              </Text>
            </Pressable>
            <Pressable
              testID="units-imperial"
              onPress={() => pick("imperial")}
              style={[styles.segItem, units === "imperial" && styles.segItemActive]}
            >
              <Text style={[styles.segText, units === "imperial" && styles.segTextActive]}>
                Imperial
              </Text>
              <Text style={[styles.segSub, units === "imperial" && styles.segSubActive]}>
                °F · mph · inHg · ft · lb
              </Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>
            Changes apply to temperature, wind, pressure, tide, swell, distance, weight, and length across the entire app.
          </Text>
        </View>

        <View>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.aboutBox}>
            <Text style={styles.aboutTitle}>FishCast</Text>
            <Text style={styles.aboutSub}>
              Real-time fishing forecast powered by Open-Meteo, marine swell data, lunar
              astronomy, and an AI almanac.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  title: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  segment: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  segItem: {
    flex: 1,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: "center",
  },
  segItemActive: {
    borderColor: COLORS.brand,
    backgroundColor: COLORS.brandTertiary,
  },
  segText: { fontSize: TYPE.lg, fontWeight: "800", color: COLORS.onSurface },
  segTextActive: { color: COLORS.onBrandTertiary },
  segSub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 4, fontWeight: "600" },
  segSubActive: { color: COLORS.onBrandTertiary },
  helper: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.md, lineHeight: 18 },
  aboutBox: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  aboutTitle: { fontSize: TYPE.lg, fontWeight: "800", color: COLORS.onSurface },
  aboutSub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.xs, lineHeight: 18 },
});
