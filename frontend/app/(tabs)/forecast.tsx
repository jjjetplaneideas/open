import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, ForecastResponse, getSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE, verdictColor } from "@/src/theme";

export default function ForecastScreen() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [locName, setLocName] = useState<string>("");

  const load = useCallback(async () => {
    const loc = await getSavedLocation();
    if (!loc) {
      setLoading(false);
      return;
    }
    setLocName(loc.display);
    try {
      const f = await api.forecast(loc.lat, loc.lon);
      setData(f);
    } catch (e) {
      // ignore
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
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No forecast available</Text>
        <Text style={styles.emptySub}>Set a location first on the Today tab.</Text>
      </SafeAreaView>
    );
  }

  const fmtDay = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return {
      day: d.toLocaleDateString([], { weekday: "short" }),
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>7-Day Forecast</Text>
        <Text style={styles.sub}>{locName}</Text>
      </View>
      <ScrollView
        testID="forecast-scroll"
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
        }
      >
        {data.days.map((d) => {
          const isOpen = expanded === d.date;
          const { day, date } = fmtDay(d.date);
          const vColor = verdictColor(d.verdict);
          return (
            <Pressable
              key={d.date}
              testID={`forecast-day-${d.date}`}
              style={styles.dayCard}
              onPress={() => setExpanded(isOpen ? null : d.date)}
            >
              <View style={styles.dayRow}>
                <View style={{ width: 60 }}>
                  <Text style={styles.dayTxt}>{day}</Text>
                  <Text style={styles.dateTxt}>{date}</Text>
                </View>
                <View style={[styles.scoreBadge, { backgroundColor: vColor }]}>
                  <Text style={styles.scoreBadgeNum}>{d.score}</Text>
                  <Text style={styles.scoreBadgeVerdict}>{d.verdict}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.weather} numberOfLines={1}>
                    {d.weather_text}
                  </Text>
                  <Text style={styles.temps}>
                    {Math.round(d.tmax_c)}° / {Math.round(d.tmin_c)}°  ·  Wind {Math.round(d.wind_max_kmh)} km/h
                  </Text>
                </View>
                <Ionicons
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={COLORS.textMuted}
                />
              </View>
              {isOpen && (
                <View style={styles.dayDetails}>
                  <DetailRow icon="speedometer-outline" label="Pressure" value={`${Math.round(d.pressure_hpa)} hPa`} />
                  <DetailRow icon="rainy-outline" label="Precip" value={`${d.precip_mm.toFixed(1)} mm`} />
                  <DetailRow icon="sunny-outline" label="Sunrise" value={fmtTime(d.sunrise)} />
                  <DetailRow icon="moon-outline" label="Sunset" value={fmtTime(d.sunset)} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={drStyles.row}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Ionicons name={icon} size={14} color={COLORS.brand} />
        <Text style={drStyles.label}>{label}</Text>
      </View>
      <Text style={drStyles.value}>{value}</Text>
    </View>
  );
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const drStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  label: { color: COLORS.textMuted, fontWeight: "600", fontSize: TYPE.sm },
  value: { color: COLORS.onSurface, fontWeight: "600", fontSize: TYPE.sm },
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  h1: { fontSize: TYPE.xxl, fontWeight: "800", color: COLORS.onSurface },
  sub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: 2 },
  emptyTitle: { fontSize: TYPE.xl, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.lg },
  emptySub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: SPACING.xs },
  dayCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayRow: { flexDirection: "row", alignItems: "center" },
  dayTxt: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface },
  dateTxt: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2 },
  scoreBadge: {
    width: 60,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  scoreBadgeNum: { color: "#FFF", fontSize: TYPE.lg, fontWeight: "800" },
  scoreBadgeVerdict: { color: "#FFF", fontSize: 10, fontWeight: "600", marginTop: 1 },
  weather: { fontSize: TYPE.base, fontWeight: "600", color: COLORS.onSurface },
  temps: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2 },
  dayDetails: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
});
