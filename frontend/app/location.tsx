import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { api, getSavedLocation, setSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function LocationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [currentName, setCurrentName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const cur = await getSavedLocation();
      if (cur) setCurrentName(cur.display);
    })();
  }, []);

  const onSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      const r = await api.geocode(query.trim());
      setResults(r.results || []);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const useGps = async () => {
    setGpsLoading(true);
    setError("");
    try {
      // Permissions
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      let canAsk = perm.canAskAgain;
      if (status !== "granted") {
        if (!canAsk) {
          setError("Location is blocked. Open Settings to enable, or enter a place below.");
          setGpsLoading(false);
          return;
        }
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
        canAsk = req.canAskAgain;
        if (status !== "granted") {
          if (!canAsk) {
            setError("Location was denied. Tap below to open Settings, or enter a place.");
          } else {
            setError("Permission needed to use GPS. Try again or enter a place below.");
          }
          setGpsLoading(false);
          return;
        }
      }

      // Get position with a hard timeout + last-known fallback
      const positionPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 8000),
      );
      let pos: Location.LocationObject | null =
        (await Promise.race([positionPromise, timeoutPromise])) as any;

      if (!pos) {
        // Fallback: try last known position
        pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
      }
      if (!pos) {
        setError("Could not get GPS signal. Try moving outdoors or enter a place below.");
        setGpsLoading(false);
        return;
      }

      const display = await api
        .reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        .then((r) => r.display)
        .catch(() => `${pos!.coords.latitude.toFixed(3)}, ${pos!.coords.longitude.toFixed(3)}`);

      await setSavedLocation({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        display,
        source: "gps",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e?.message || "Could not get GPS location. Try entering a place below.");
    } finally {
      setGpsLoading(false);
    }
  };

  const openSettings = () => Linking.openSettings();

  const pickResult = async (r: any) => {
    await setSavedLocation({
      lat: r.lat,
      lon: r.lon,
      display: r.display,
      source: "manual",
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-location" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Location</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ padding: SPACING.lg, gap: SPACING.lg }}>
          {currentName ? (
            <View style={styles.currentBox}>
              <Text style={styles.currentLabel}>CURRENT</Text>
              <Text style={styles.currentName}>{currentName}</Text>
            </View>
          ) : null}

          <Pressable
            testID="use-gps-button"
            style={styles.gpsBtn}
            onPress={useGps}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <ActivityIndicator color={COLORS.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="locate" size={20} color={COLORS.onBrandPrimary} />
                <Text style={styles.gpsBtnText}>Use My Location (GPS)</Text>
              </>
            )}
          </Pressable>

          <Pressable
            testID="pick-on-map-button"
            style={styles.mapBtn}
            onPress={() => router.push("/map-picker")}
          >
            <Ionicons name="map-outline" size={20} color={COLORS.brand} />
            <Text style={styles.mapBtnText}>Pick a Pin on the Map</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or enter manually</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              testID="location-search-input"
              style={styles.input}
              placeholder="City or zip code"
              placeholderTextColor={COLORS.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={onSearch}
              autoCapitalize="words"
            />
            <Pressable
              testID="location-search-button"
              onPress={onSearch}
              style={styles.searchBtn}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator color={COLORS.onBrandPrimary} size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Search</Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errBox}>
              <Text style={styles.errText}>{error}</Text>
              {error.toLowerCase().includes("settings") || error.toLowerCase().includes("blocked") || error.toLowerCase().includes("denied") ? (
                <Pressable testID="open-settings-button" style={styles.errBtn} onPress={openSettings}>
                  <Ionicons name="settings-outline" size={14} color={COLORS.brand} />
                  <Text style={styles.errBtnText}>Open Settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <FlatList
          testID="search-results"
          data={results}
          keyExtractor={(item, idx) => `${item.lat}-${item.lon}-${idx}`}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl }}
          renderItem={({ item }) => (
            <Pressable
              testID={`location-result-${item.display}`}
              style={styles.resultRow}
              onPress={() => pickResult(item)}
            >
              <Ionicons name="location-outline" size={18} color={COLORS.brand} />
              <Text style={styles.resultText}>{item.display}</Text>
            </Pressable>
          )}
        />
      </KeyboardAvoidingView>
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
  currentBox: {
    backgroundColor: COLORS.brandTertiary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  currentLabel: { fontSize: 11, fontWeight: "700", color: COLORS.onBrandTertiary, letterSpacing: 1 },
  currentName: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onBrandTertiary, marginTop: 4 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.brand,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  gpsBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.base },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 2,
    borderColor: COLORS.brand,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  mapBtnText: { color: COLORS.brand, fontWeight: "700", fontSize: TYPE.base },
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.divider },
  dividerText: { fontSize: TYPE.sm, color: COLORS.textMuted },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  input: { flex: 1, fontSize: TYPE.base, color: COLORS.onSurface, paddingVertical: SPACING.md },
  searchBtn: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  searchBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.sm },
  errText: { color: COLORS.error, fontSize: TYPE.sm },
  errBox: {
    backgroundColor: "#FBEAE7",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  errBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  errBtnText: { color: COLORS.brand, fontWeight: "700", fontSize: TYPE.sm },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  resultText: { fontSize: TYPE.base, color: COLORS.onSurface, flex: 1 },
});
