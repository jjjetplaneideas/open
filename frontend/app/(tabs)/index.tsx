import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import {
  api, ForecastResponse, getSavedLocation, SavedLocation, Recommendation,
} from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE, verdictColor } from "@/src/theme";
import { speedKmh, tempC, pressureValue, pressureUnit, useUnits } from "@/src/units";
import LiveConditions from "@/src/components/LiveConditions";
import TideChart from "@/src/components/TideChart";
import SwellChart from "@/src/components/SwellChart";
import MoonCard from "@/src/components/MoonCard";
import SafetyBanner from "@/src/components/SafetyBanner";
import ScoreBreakdown from "@/src/components/ScoreBreakdown";

export default function TodayScreen() {
  const router = useRouter();
  const { units } = useUnits();
  const [loc, setLoc] = useState<SavedLocation | null>(null);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [almanac, setAlmanac] = useState<string>("");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loadingAlmanac, setLoadingAlmanac] = useState(false);
  const [loadingRec, setLoadingRec] = useState(false);
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

      const aiBody = {
        lat: saved.lat,
        lon: saved.lon,
        location_name: saved.display,
        score: f.today_score.score,
        verdict: f.today_score.verdict,
        pressure_trend: f.pressure_trend.trend,
        wind_kmh: f.current.wind_kmh,
        temp_c: f.current.temperature_c,
        weather: f.current.weather_text,
        moon_phase: f.moon.phase_name,
        tide_direction: f.tide?.direction || "",
      };

      setLoadingAlmanac(true);
      api.almanac(aiBody)
        .then((r) => setAlmanac(r.almanac))
        .catch(() => setAlmanac("Local almanac unavailable right now."))
        .finally(() => setLoadingAlmanac(false));

      setLoadingRec(true);
      api.recommend({ ...aiBody, is_coastal: !!f.tide })
        .then((r) => setRec(r))
        .catch(() => setRec(null))
        .finally(() => setLoadingRec(false));
    } catch (e: any) {
      setError(e?.message || "Unable to fetch conditions");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        <Text style={styles.emptySub}>Use GPS, enter a city, or drop a pin on the map.</Text>
        <Pressable
          testID="set-location-button"
          style={styles.primaryBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/location"); }}
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
    data.pressure_trend.trend === "rising" ? "trending-up" :
    data.pressure_trend.trend === "falling" ? "trending-down" : "remove";

  const fmtTime = (iso?: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
  };
  const fmtRange = (start?: string, end?: string) =>
    start && end ? `${fmtTime(start)} – ${fmtTime(end)}` : "—";

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <ScrollView
        testID="today-scroll"
        contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
        {/* Live animated conditions */}
        <View style={styles.heroBox}>
          <LiveConditions
            scene={data.scene}
            windKmh={data.current.wind_kmh || 0}
            swellM={data.swell?.current_swell_m || 0}
            height={260}
          />
          <SafeAreaView edges={["top"]} style={styles.heroHeader}>
            <Pressable testID="location-pill" style={styles.locPill} onPress={() => router.push("/location")}>
              <Ionicons name="location" size={14} color="#FFF" />
              <Text style={styles.locPillText} numberOfLines={1}>{loc.display}</Text>
              <Ionicons name="chevron-down" size={14} color="#FFF" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <Pressable testID="spots-button" style={styles.iconBtn} onPress={() => router.push("/spots")}>
                <Ionicons name="bookmark-outline" size={18} color="#FFF" />
              </Pressable>
              <Pressable testID="settings-button" style={styles.iconBtn} onPress={() => router.push("/settings")}>
                <Ionicons name="settings-outline" size={18} color="#FFF" />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Score overlay (bottom-left) */}
          <View style={styles.scoreOverlay}>
            <Text style={styles.heroLabel}>FISHING SCORE</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm }}>
              <Text testID="fishing-score" style={styles.scoreNumber}>{sc.score}</Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <View style={[styles.verdictBadge, { backgroundColor: vColor }]} testID="verdict-badge">
              <Text style={styles.verdictText}>{sc.verdict}</Text>
            </View>
          </View>
        </View>

        {/* Safety Banner — appears above everything when not Safe */}
        <SafetyBanner safety={data.safety} />

        {/* Verdict blurb + scene text */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryBlurb}>{sc.blurb}</Text>
          <Text style={styles.summarySub} testID="scene-summary">
            {data.current.weather_text} · {speedKmh(data.current.wind_kmh, units)} wind · {tempC(data.current.temperature_c, units)}
          </Text>
          <View style={styles.confidenceRow}>
            <View
              style={[
                styles.confChip,
                {
                  backgroundColor:
                    data.confidence.label === "High"
                      ? COLORS.brandTertiary
                      : data.confidence.label === "Medium"
                      ? "#FBEFC8"
                      : "#FBEAE7",
                },
              ]}
              testID="confidence-chip"
            >
              <Text style={styles.confChipText}>Confidence: {data.confidence.label}</Text>
            </View>
            <Pressable
              testID="hotspots-button"
              style={styles.linkChip}
              onPress={() => router.push("/hotspots")}
            >
              <Text style={styles.linkChipText}>Nearby Hotspots</Text>
            </Pressable>
            <Pressable
              testID="regulations-button"
              style={styles.linkChip}
              onPress={() => router.push("/regulations")}
            >
              <Text style={styles.linkChipText}>Regulations</Text>
            </Pressable>
          </View>
        </View>

        {/* Score breakdown */}
        <ScoreBreakdown contributors={sc.contributors || []} />

        {/* Best Window */}
        {data.best_window && (
          <View style={[styles.fullCard, styles.bestWindow]} testID="best-window">
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
                <Ionicons name="time-outline" size={18} color={COLORS.onBrandPrimary} />
                <Text style={[styles.cardTitle, { color: COLORS.onBrandPrimary }]}>Best Window Today</Text>
              </View>
              <Text style={{ color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.sm }}>{data.best_window.label}</Text>
            </View>
            <Text style={styles.bestWindowTime}>{fmtRange(data.best_window.start, data.best_window.end)}</Text>
          </View>
        )}

        {/* AI Recommendation */}
        <View style={[styles.fullCard, styles.recCard]} testID="recommendation-card">
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="trophy-outline" size={18} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Best Bet Right Now</Text>
            </View>
          </View>
          {loadingRec ? (
            <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.md }} />
          ) : rec ? (
            <View style={{ marginTop: SPACING.sm, gap: 6 }}>
              <RecRow label="Target" value={rec.target_species} />
              <RecRow label="Bait/Lure" value={rec.bait} />
              <RecRow label="Depth" value={rec.depth} />
              <Text style={styles.recPresentation}>{rec.presentation}</Text>
            </View>
          ) : (
            <Text style={styles.cardCaption}>Tap pull-to-refresh to try again.</Text>
          )}
        </View>

        {/* Barometric Pressure */}
        <View style={[styles.fullCard]} testID="barometric-card">
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="speedometer-outline" size={18} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Barometric Pressure</Text>
            </View>
            <View
              style={[
                styles.trendChip,
                { backgroundColor: data.pressure_trend.trend === "falling" ? COLORS.brandTertiary : COLORS.surfaceTertiary },
              ]}
            >
              <Ionicons name={trendIcon as any} size={14} color={COLORS.brand} />
              <Text style={styles.trendText}>{data.pressure_trend.label}</Text>
            </View>
          </View>
          <Text style={styles.bigStat}>
            {pressureValue(data.current.pressure_hpa, units)}
            <Text style={styles.bigStatUnit}> {pressureUnit(units)}</Text>
          </Text>
          <Text style={styles.cardCaption}>
            {data.pressure_trend.trend === "falling"
              ? "Falling fast — fish often feed before storms."
              : data.pressure_trend.trend === "rising"
              ? "Pressure climbing — bite usually slows."
              : `Δ ${data.pressure_trend.delta_hpa} hPa over last 6h`}
          </Text>
        </View>

        {/* Wind / Temp grid */}
        <View style={styles.gridRow}>
          <View style={[styles.halfCard]} testID="wind-card">
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="navigate-outline" size={16} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Wind</Text>
            </View>
            <Text style={styles.bigStat}>{speedKmh(data.current.wind_kmh, units)}</Text>
            <Text style={styles.cardCaption}>{degToCompass(data.current.wind_dir_deg)} · gusts vary</Text>
          </View>
          <View style={[styles.halfCard]} testID="temp-card">
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="thermometer-outline" size={16} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Air Temp</Text>
            </View>
            <Text style={styles.bigStat}>{tempC(data.current.temperature_c, units)}</Text>
            <Text style={styles.cardCaption}>{data.current.cloud_pct}% clouds</Text>
          </View>
        </View>

        {/* Moon */}
        <View style={styles.cardSlot}>
          <MoonCard moon={data.moon} />
        </View>

        {/* Tide */}
        {data.tide && (
          <View style={styles.cardSlot} testID="tide-card">
            <TideChart
              series={data.tide.series}
              extrema={data.tide.extrema}
              current={data.tide.current_height_m}
              direction={data.tide.direction}
              units={units}
            />
          </View>
        )}

        {/* Swell */}
        {data.swell && (
          <View style={styles.cardSlot} testID="swell-card">
            <SwellChart
              series={data.swell.series}
              currentSwell={data.swell.current_swell_m}
              currentPeriod={data.swell.current_period_s}
              currentDir={data.swell.current_dir_deg}
              currentWave={data.swell.current_wave_m}
              units={units}
            />
          </View>
        )}

        {/* Sun */}
        <View style={[styles.fullCard]} testID="sun-card">
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
              <Ionicons name="sunny-outline" size={18} color={COLORS.brand} />
              <Text style={styles.cardTitle}>Sun</Text>
            </View>
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
        </View>

        {/* Almanac AI */}
        <View style={[styles.fullCard, styles.almanacCard]} testID="almanac-card">
          <View style={{ flexDirection: "row", gap: SPACING.sm, alignItems: "center" }}>
            <Ionicons name="book-outline" size={18} color={COLORS.onBrandPrimary} />
            <Text style={[styles.cardTitle, { color: COLORS.onBrandPrimary }]}>Local Angler Almanac</Text>
          </View>
          {loadingAlmanac ? (
            <ActivityIndicator color={COLORS.onBrandPrimary} style={{ marginTop: SPACING.md }} />
          ) : (
            <Text style={styles.almanacText}>{almanac}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function RecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.md }}>
      <Text style={styles.recLabel}>{label}</Text>
      <Text style={styles.recValue}>{value}</Text>
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
  emptyTitle: { fontSize: TYPE.xl, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.lg, textAlign: "center" },
  emptySub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: SPACING.xs, textAlign: "center", paddingHorizontal: SPACING.xl },
  primaryBtn: {
    marginTop: SPACING.xl, backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.lg },

  heroBox: { position: "relative" },
  heroHeader: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
    alignItems: "center", justifyContent: "space-between",
  },
  locPill: {
    flexDirection: "row", alignItems: "center", gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: "rgba(28,29,28,0.5)", borderRadius: RADIUS.pill, maxWidth: "70%",
  },
  locPillText: { color: "#FFF", fontWeight: "600", fontSize: TYPE.base },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(28,29,28,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  scoreOverlay: {
    position: "absolute", left: SPACING.lg, bottom: SPACING.lg,
  },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  scoreNumber: { color: "#FFF", fontSize: 76, fontWeight: "800", lineHeight: 80, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 8 },
  scoreOutOf: { color: "rgba(255,255,255,0.7)", fontSize: TYPE.xl, fontWeight: "600", marginBottom: 6 },
  verdictBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: RADIUS.pill, marginTop: SPACING.xs,
  },
  verdictText: { color: "#FFF", fontWeight: "800", fontSize: TYPE.sm },

  summaryBox: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 4 },
  summaryBlurb: { fontSize: TYPE.lg, color: COLORS.onSurface, fontWeight: "700" },
  summarySub: { fontSize: TYPE.sm, color: COLORS.textMuted },
  confidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  confChip: { paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.pill },
  confChipText: { fontSize: 11, fontWeight: "800", color: COLORS.onSurface },
  linkChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.brand, backgroundColor: COLORS.surfaceSecondary,
  },
  linkChipText: { fontSize: 11, fontWeight: "800", color: COLORS.brand },

  cardSlot: { paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  fullCard: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  halfCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  gridRow: { flexDirection: "row", gap: SPACING.md, paddingHorizontal: SPACING.lg, marginTop: SPACING.md },

  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  cardCaption: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
  bigStat: { fontSize: 32, fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.sm },
  bigStatUnit: { fontSize: TYPE.lg, fontWeight: "600", color: COLORS.textMuted },

  trendChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.pill },
  trendText: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.brand },

  bestWindow: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  bestWindowTime: { color: COLORS.onBrandPrimary, fontSize: 28, fontWeight: "800", marginTop: SPACING.xs },

  recCard: {},
  recLabel: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "700", width: 80 },
  recValue: { flex: 1, fontSize: TYPE.base, color: COLORS.onSurface, fontWeight: "700", textAlign: "right" },
  recPresentation: { marginTop: SPACING.sm, fontSize: TYPE.sm, color: COLORS.onSurface, lineHeight: 20, fontStyle: "italic" },

  sunLabel: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "600" },
  sunTime: { fontSize: TYPE.xl, fontWeight: "700", color: COLORS.onSurface, marginTop: 2 },

  almanacCard: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  almanacText: { color: COLORS.onBrandPrimary, fontSize: TYPE.base, lineHeight: 22, marginTop: SPACING.md },
});
