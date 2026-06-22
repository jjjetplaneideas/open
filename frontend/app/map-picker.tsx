/**
 * Interactive map pin picker (WebView + Leaflet + OpenStreetMap tiles).
 * Works on iOS, Android, and Web — no API keys required.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { api, getSavedLocation, setSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

function buildHtml(lat: number, lon: number): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
  body { background: #1C1D1C; font-family: -apple-system, system-ui, sans-serif; }
  .leaflet-control-attribution { font-size: 9px; }
  .crosshair {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -100%);
    pointer-events: none; z-index: 1000;
  }
  .pin {
    width: 28px; height: 38px;
    background: #425E4A; border: 3px solid #fff;
    border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
    box-shadow: 0 4px 10px rgba(0,0,0,0.4);
  }
  .pin::after {
    content: ''; position: absolute;
    left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(45deg);
    width: 10px; height: 10px; background: #fff; border-radius: 50%;
  }
</style>
</head><body>
<div id="map"></div>
<div class="crosshair"><div class="pin"></div></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([${lat}, ${lon}], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  function postCenter() {
    var c = map.getCenter();
    var msg = JSON.stringify({ type: 'center', lat: c.lat, lon: c.lng });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    }
  }
  map.on('move', postCenter);
  map.on('moveend', postCenter);
  setTimeout(postCenter, 100);
</script>
</body></html>`;
}

export default function MapPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lon?: string }>();
  const webRef = useRef<WebView>(null);

  const [center, setCenter] = useState<{ lat: number; lon: number }>({
    lat: params.lat ? parseFloat(String(params.lat)) : 37.7749,
    lon: params.lon ? parseFloat(String(params.lon)) : -122.4194,
  });
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<{ lat: number; lon: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (params.lat && params.lon) {
        setInitial({ lat: parseFloat(String(params.lat)), lon: parseFloat(String(params.lon)) });
        return;
      }
      const saved = await getSavedLocation();
      if (saved) {
        setInitial({ lat: saved.lat, lon: saved.lon });
        setCenter({ lat: saved.lat, lon: saved.lon });
      } else {
        setInitial({ lat: 37.7749, lon: -122.4194 });
      }
    })();
  }, [params.lat, params.lon]);

  const onMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === "center") {
        setCenter({ lat: data.lat, lon: data.lon });
      }
    } catch {
      /* ignore */
    }
  };

  const useGps = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setInitial({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude });
  };

  const confirm = async () => {
    setSaving(true);
    let display = `${center.lat.toFixed(3)}, ${center.lon.toFixed(3)}`;
    try {
      const r = await api.reverseGeocode(center.lat, center.lon);
      display = r.display || display;
    } catch {
      /* ignore */
    }
    await setSavedLocation({ lat: center.lat, lon: center.lon, display, source: "manual" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    router.back();
  };

  if (!initial) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.brand} />
      </SafeAreaView>
    );
  }

  const html = buildHtml(initial.lat, initial.lon);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable testID="close-map" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Pick on Map</Text>
        <Pressable testID="gps-map" hitSlop={10} onPress={useGps}>
          <Ionicons name="locate" size={22} color={COLORS.brand} />
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          testID="map-webview"
          ref={webRef}
          source={Platform.select({
            web: { uri: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` },
            default: { html, baseUrl: "https://localhost" },
          }) as any}
          originWhitelist={["*"]}
          onMessage={onMessage}
          onLoadEnd={() => setReady(true)}
          style={{ flex: 1, backgroundColor: COLORS.surfaceInverse }}
          javaScriptEnabled
          domStorageEnabled
        />
        {!ready && (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.brand} />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.coordLabel}>SELECTED COORDINATES</Text>
          <Text testID="selected-coords" style={styles.coordValue}>
            {center.lat.toFixed(4)}, {center.lon.toFixed(4)}
          </Text>
        </View>
        <Pressable
          testID="confirm-pin"
          style={styles.confirmBtn}
          onPress={confirm}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.onBrandPrimary} />
          ) : (
            <Text style={styles.confirmText}>Use This Pin</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
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
  mapWrap: { flex: 1, position: "relative" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  coordLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1.2 },
  coordValue: { fontSize: TYPE.base, fontWeight: "800", color: COLORS.onSurface, marginTop: 2 },
  confirmBtn: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  confirmText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: TYPE.base },
});
