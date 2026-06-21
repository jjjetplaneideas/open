import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api, ForecastResponse, getSavedLocation, SavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE, verdictColor } from "@/src/theme";

const HERO_IMG =
  "https://images.pexels.com/photos/35826250/pexels-photo-35826250.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function TodayScreen() {
  const router = useRouter();
  const [loc, setLoc] = useState<SavedLocation | null>(null);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [almanac, setAlmanac] = useState<string>("");
  const [loadingAlmanac, setLoadingAlmanac] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setError("");
    const saved = await getSavedLocation();
    setLoc(saved);
    if (!saved) {
      setLoading(false);
      return;
    }
    try {
      const f = await api.forecast(saved.lat, saved.lon);
      setData(f);
      // fire and forget almanac
      setLoadingAlmanac(true);
      api
        .almanac({
          lat: saved.lat,
          lon: saved.lon,
          location_name: saved.display,
          score: f.today_score.score,
          verdict: f.today_score.verdict,
          pressure_trend: f.pressure_trend.trend,
          wind_kmh: f.current.wind_kmh,
          temp_c: f.current.temperature_c,
          weather: f.current.weather_text,
        })
        .then((r) => setAlmanac(r.almanac))
        .catch(() => setAlmanac("Local almanac unavailable right now."))
        .finally(() => setLoadingAlmanac(false));
    } catch (e: any) {
      setError(e?.message || "Unable to fetch conditions");
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
      <View style={[styles.center, { backgroundColor: COLORS.surface }]} testID="today-loading">
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  if (!loc) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: COLORS.surface }]} testID="today-no-location">
        <Ionicons name="location-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>Set your fishing location</Text>
        <Text style={styles.emptySub}>Use GPS or enter a city to get started.</Text>
        <Pressable
          testID="set-location-button"
          style={styles.primaryBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/location");
          }}
        >
          <Text style={styles.primaryBtnText}>Set Location</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: COLORS.surface }]} testID="today-error">
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.error} />
        <Text style={styles.emptyTitle}>Unable to fetch conditions</Text>
        <Text style={styles.emptySub}>{error}</Text>
        <Pressable testID="retry-button" style={styles.primaryBtn} onPress={load}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const sc = data.today_score;
  const vColor = verdictColor(sc.verdict);
  const trendIcon =
    data.pressure_trend.trend === "rising"
      ? "trending-up"
      : data.pressure_trend.trend === "falling"
      ? "trending-down"
      : "remove";
  const fmtTime = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <ScrollView
        testID="today-scroll"
        contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
        }
      >
        {/* Hero */}
        <View style={styles.hero} testID="today-hero">
          <Image source={{ uri: HERO_IMG }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(28,29,28,0.15)", "rgba(28,29,28,0.85)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroHeader}>
            <Pressable
              testID="location-pill"
              style={styles.locPill}
              onPress={() => router.push("/location")}
            >
              <Ionicons name="location" size={14} color="#FFF" />
              <Text style={styles.locPillText} numberOfLines={1}>
                {loc.display}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#FFF" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <Pressable
                testID="spots-button"
                style={styles.iconBtn}
                onPress={() => router.push("/spots")}
              >
                <Ionicons name="bookmark-outline" size={20} color="#FFF" />
              </Pressable>
            </View>
          </SafeAreaView>

          <View style={styles.heroBody}>
            <Text style={styles.heroLabel}>TODAY'S FISHING SCORE</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm }}>
              <Text testID="fishing-score" style={styles.scoreNumber}>
                {sc.score}
              </Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <View style={[styles.verdictBadge, { backgroundColor: vColor }]} testID="verdict-badge">
              <Text style={styles.verdictText}>{sc.verdict}</Text>
            </View>
            <Text style={styles.heroBlurb}>{sc.blurb}</Text>
          </View>
        </View>

        {/* Quick condition grid */}
        <View style={styles.grid}>
          {/* Barometric — full width, prominent */}
          <View style={[styles.card, styles.cardFull]} testID="barometric-card">
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
                <Ionicons name="speedometer-outline" size={18} color={COLORS.brand} />
                <Text style={styles.cardTitle}>Barometric Pressure</Text>
              </View>
              <View
                style={[
                  styles.trendChip,
                  {
                    backgroundColor:
                      data.pressure_trend.trend === "falling"
                        ? COLORS.brandTertiary
                        : COLORS.surfaceTertiary,
                  },
                ]}
              >
                <Ionicons name={trendIcon as any} size={14} color={COLORS.brand} />
                <Text style={styles.trendText}>{data.pressure_trend.label}</Text>
              </View>
            </View>
            <Text style={styles.bigStat}>
              {Math.round(data.current.pressure_hpa)}
              <Text style={styles.bigStatUnit}> hPa</Text>
            </Text>
            <Text style={styles.cardCaption}>
              {data.pressure_trend.trend === "falling"
                ? "Falling fast — fish often feed before storms."
                : data.pressure_trend.trend === "rising"
                ? "Pressure climbing — bite usually slows."
                : `Δ ${data.pressure_trend.delta_hpa} hPa over last 6h`}
            </Text>
          </View>

          {/* Two-up: Wind / Temp */}
          <View style={[styles.card, styles.cardHalf]} testID="wind-card">
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="navigate-outline" size={16} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Wind</Text>
            </View>
            <Text style={styles.bigStat}>
              {Math.round(data.current.wind_kmh)}
              <Text style={styles.bigStatUnit}> km/h</Text>
            </Text>
            <Text style={styles.cardCaption}>{degToCompass(data.current.wind_dir_deg)}</Text>
          </View>
          <View style={[styles.card, styles.cardHalf]} testID="temp-card">
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="thermometer-outline" size={16} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Air Temp</Text>
            </View>
            <Text style={styles.bigStat}>
              {Math.round(data.current.temperature_c)}
              <Text style={styles.bigStatUnit}>°C</Text>
            </Text>
            <Text style={styles.cardCaption}>{data.current.weather_text}</Text>
          </View>

          {/* Sun + Solunar */}
          <View style={[styles.card, styles.cardFull]} testID="sun-card">
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
                <Ionicons name="sunny-outline" size={18} color={COLORS.brand} />
                <Text style={styles.cardTitle}>Sun & Solunar</Text>
              </View>
              <Text style={styles.cardCaption}>
                {data.current.cloud_pct}% clouds
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.md }}>
              <View>
                <Text style={styles.sunLabel}>Sunrise</Text>
                <Text style={styles.sunTime}>{fmtTime(data.sunrise)}</Text>
              </View>
              <View>
                <Text style={styles.sunLabel}>Sunset</Text>
                <Text style={styles.sunTime}>{fmtTime(data.sunset)}</Text>
              </View>
            </View>
            <View style={styles.solunarRow}>
              {data.solunar.major.map((m, i) => (
                <View key={`maj${i}`} style={styles.solunarChip}>
                  <View style={[styles.solunarDot, { backgroundColor: COLORS.brand }]} />
                  <Text style={styles.solunarText}>
                    {m.label} {m.start}–{m.end}
                  </Text>
                </View>
              ))}
              {data.solunar.minor.map((m, i) => (
                <View key={`min${i}`} style={styles.solunarChip}>
                  <View style={[styles.solunarDot, { backgroundColor: COLORS.brandSecondary }]} />
                  <Text style={styles.solunarText}>
                    {m.label} {m.start}–{m.end}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Almanac AI */}
          <View style={[styles.card, styles.cardFull, styles.almanacCard]} testID="almanac-card">
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="book-outline" size={18} color={COLORS.onBrandPrimary} />
              <Text style={[styles.cardTitle, { color: COLORS.onBrandPrimary }]}>
                Local Angler Almanac
              </Text>
            </View>
            {loadingAlmanac ? (
              <ActivityIndicator color={COLORS.onBrandPrimary} style={{ marginTop: SPACING.md }} />
            ) : (
              <Text style={styles.almanacText}>{almanac}</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function degToCompass(deg: number): string {
  if (deg == null || isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  emptyTitle: {
    fontSize: TYPE.xl,
    fontWeight: "700",
    color: COLORS.onSurface,
    marginTop: SPACING.lg,
  },
  emptySub: {
    fontSize: TYPE.base,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.lg },

  hero: { height: 440, position: "relative" },
  heroHeader: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    alignItems: "center",
    justifyContent: "space-between",
  },
  locPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.pill,
    maxWidth: "70%",
  },
  locPillText: { color: "#FFF", fontWeight: "600", fontSize: TYPE.base },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: { position: "absolute", bottom: SPACING.xl, left: SPACING.lg, right: SPACING.lg },
  heroLabel: { color: "rgba(255,255,255,0.75)", fontSize: TYPE.sm, fontWeight: "700", letterSpacing: 1.5 },
  scoreNumber: { color: "#FFF", fontSize: 96, fontWeight: "800", lineHeight: 100 },
  scoreOutOf: { color: "rgba(255,255,255,0.6)", fontSize: TYPE.xl, fontWeight: "600", marginBottom: 8 },
  verdictBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    marginTop: SPACING.sm,
  },
  verdictText: { color: "#FFF", fontWeight: "700", fontSize: TYPE.base },
  heroBlurb: { color: "rgba(255,255,255,0.85)", fontSize: TYPE.lg, marginTop: SPACING.sm, fontWeight: "500" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardFull: { width: "100%" },
  cardHalf: { width: "48%", flexGrow: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  cardCaption: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
  bigStat: {
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.onSurface,
    marginTop: SPACING.sm,
  },
  bigStatUnit: { fontSize: TYPE.lg, fontWeight: "600", color: COLORS.textMuted },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  trendText: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.brand },

  sunLabel: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "600" },
  sunTime: { fontSize: TYPE.xl, fontWeight: "700", color: COLORS.onSurface, marginTop: 2 },
  solunarRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.lg },
  solunarChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceTertiary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  solunarDot: { width: 8, height: 8, borderRadius: 4 },
  solunarText: { fontSize: TYPE.sm, fontWeight: "600", color: COLORS.onSurfaceTertiary },

  almanacCard: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  almanacText: {
    color: COLORS.onBrandPrimary,
    fontSize: TYPE.base,
    lineHeight: 22,
    marginTop: SPACING.md,
  },
});
