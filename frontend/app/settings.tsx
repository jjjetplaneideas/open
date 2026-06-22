import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { useUnits, UnitSystem } from "@/src/units";
import { api, getOrCreateUserId } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

const PREFS_KEY = "fishcast.prefs";

type Prefs = { fishing_style: string[]; favorite_species: string };

const STYLES = ["Shore", "Kayak", "Boat", "Offshore", "Freshwater", "Saltwater"];

export default function SettingsScreen() {
  const router = useRouter();
  const { units, setUnits } = useUnits();
  const [prefs, setPrefs] = useState<Prefs>({ fishing_style: [], favorite_species: "" });
  const [voucher, setVoucher] = useState("");
  const [voucherMsg, setVoucherMsg] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try { setPrefs(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

  const savePrefs = async (next: Prefs) => {
    setPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  const toggleStyle = (s: string) => {
    Haptics.selectionAsync();
    const has = prefs.fishing_style.includes(s);
    savePrefs({
      ...prefs,
      fishing_style: has ? prefs.fishing_style.filter((x) => x !== s) : [...prefs.fishing_style, s],
    });
  };

  const redeemVoucher = () => {
    const code = voucher.trim().toUpperCase();
    if (!code) return;
    if (["FREE30", "FOUNDER", "TOURNAMENT2026"].includes(code)) {
      setVoucherMsg(`✓ Code "${code}" recognized. Premium activation lands next release.`);
    } else {
      setVoucherMsg("Code not recognized.");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const exportData = async () => {
    const uid = await getOrCreateUserId();
    try {
      const r = await api.exportUser(uid);
      Alert.alert(
        "Export ready",
        `Spots: ${r.spots?.length || 0}\nCatches: ${r.catches?.length || 0}\n\nFull export captured in app memory; share/save in next release.`,
      );
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Try again");
    }
  };

  const deleteAllData = async () => {
    Alert.alert("Delete all my data?", "This permanently deletes your spots and catch journal.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const uid = await getOrCreateUserId();
          try {
            const r = await api.deleteUserData(uid);
            Alert.alert("Deleted", `${r.spots_deleted} spots and ${r.catches_deleted} catches removed.`);
          } catch (e: any) {
            Alert.alert("Delete failed", e?.message || "Try again");
          }
        },
      },
    ]);
  };

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

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.xl, paddingBottom: SPACING.xxxl }}>
        <View>
          <Text style={styles.sectionLabel}>UNITS</Text>
          <View style={styles.segment}>
            <Pressable testID="units-metric" onPress={() => pick("metric")} style={[styles.segItem, units === "metric" && styles.segItemActive]}>
              <Text style={[styles.segText, units === "metric" && styles.segTextActive]}>Metric</Text>
              <Text style={[styles.segSub, units === "metric" && styles.segSubActive]}>°C · km/h · hPa · m · kg</Text>
            </Pressable>
            <Pressable testID="units-imperial" onPress={() => pick("imperial")} style={[styles.segItem, units === "imperial" && styles.segItemActive]}>
              <Text style={[styles.segText, units === "imperial" && styles.segTextActive]}>Imperial</Text>
              <Text style={[styles.segSub, units === "imperial" && styles.segSubActive]}>°F · mph · inHg · ft · lb</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>FISHING STYLE</Text>
          <Text style={styles.helper}>Used to personalize species and tactical recommendations.</Text>
          <View style={styles.chipRow}>
            {STYLES.map((s) => {
              const active = prefs.fishing_style.includes(s);
              return (
                <Pressable
                  key={s}
                  testID={`style-${s}`}
                  onPress={() => toggleStyle(s)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>VOUCHER CODE</Text>
          <View style={styles.voucherRow}>
            <Text
              testID="voucher-input"
              style={styles.voucherInput}
              onPress={() => Alert.prompt && Alert.prompt("Enter voucher code", "", (t) => setVoucher(t || ""))}
            >
              {voucher || "Tap to enter code"}
            </Text>
            <Pressable testID="redeem-voucher" onPress={redeemVoucher} style={styles.redeemBtn}>
              <Text style={styles.redeemText}>Redeem</Text>
            </Pressable>
          </View>
          {voucherMsg ? <Text style={styles.voucherMsg}>{voucherMsg}</Text> : null}
        </View>

        <View>
          <Text style={styles.sectionLabel}>DATA</Text>
          <Pressable testID="export-button" style={styles.dataBtn} onPress={exportData}>
            <Ionicons name="download-outline" size={18} color={COLORS.brand} />
            <Text style={styles.dataBtnText}>Export My Data</Text>
          </Pressable>
          <Pressable testID="delete-data-button" style={[styles.dataBtn, { borderColor: COLORS.error }]} onPress={deleteAllData}>
            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            <Text style={[styles.dataBtnText, { color: COLORS.error }]}>Delete All My Data</Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.sectionLabel}>LEGAL</Text>
          <Pressable style={styles.dataBtn} onPress={() => Alert.alert("Terms of Service", "See in-app legal section under onboarding.")}><Ionicons name="document-outline" size={18} color={COLORS.brand} /><Text style={styles.dataBtnText}>Terms of Service</Text></Pressable>
          <Pressable style={styles.dataBtn} onPress={() => Alert.alert("Privacy Policy", "See in-app legal section under onboarding.")}><Ionicons name="shield-outline" size={18} color={COLORS.brand} /><Text style={styles.dataBtnText}>Privacy Policy</Text></Pressable>
          <Pressable style={styles.dataBtn} onPress={() => Alert.alert("Liability Waiver", "See in-app legal section under onboarding.")}><Ionicons name="warning-outline" size={18} color={COLORS.brand} /><Text style={styles.dataBtnText}>Liability Waiver</Text></Pressable>
        </View>

        <View>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.aboutBox}>
            <Text style={styles.aboutTitle}>FishCast</Text>
            <Text style={styles.aboutSub}>
              Fishing intelligence powered by Open-Meteo, marine swell data, lunar astronomy, OpenStreetMap, and Claude AI.
            </Text>
          </View>
        </View>
      </ScrollView>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary,
  },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.onBrandPrimary },
  voucherRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  voucherInput: {
    flex: 1, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    color: COLORS.textMuted, fontSize: TYPE.base,
  },
  redeemBtn: { backgroundColor: COLORS.brand, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  redeemText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: TYPE.base },
  voucherMsg: { color: COLORS.brand, fontSize: TYPE.sm, marginTop: SPACING.sm, fontWeight: "600" },
  dataBtn: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.brand,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  dataBtnText: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.brand },
});
