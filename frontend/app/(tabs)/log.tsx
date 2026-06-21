import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api, Catch, getOrCreateUserId } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function LogScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Catch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const uid = await getOrCreateUserId();
    try {
      const r = await api.listCatches(uid);
      setItems(r);
    } catch {
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

  const onDelete = async (id: string) => {
    Alert.alert("Delete catch?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const uid = await getOrCreateUserId();
          try {
            await api.deleteCatch(id, uid);
            setItems((prev) => prev.filter((c) => c.id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // ignore
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Catch Journal</Text>
        <Text style={styles.sub}>
          {items.length} {items.length === 1 ? "catch" : "catches"} logged
        </Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center} testID="log-empty">
          <Ionicons name="bookmark-outline" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Your catch journal is empty</Text>
          <Text style={styles.emptySub}>Tap + to log your first catch.</Text>
        </View>
      ) : (
        <FlatList
          testID="catches-list"
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`catch-${item.id}`}>
              {item.photo_base64 ? (
                <View style={styles.photoWrap}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${item.photo_base64}` }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(28,29,28,0.85)"]}
                    style={styles.photoScrim}
                  />
                  <View style={styles.photoOverlay}>
                    <Text style={styles.species}>{item.species}</Text>
                    {(item.weight_lbs || item.length_in) && (
                      <Text style={styles.meta}>
                        {item.weight_lbs ? `${item.weight_lbs} lb` : ""}
                        {item.weight_lbs && item.length_in ? "  ·  " : ""}
                        {item.length_in ? `${item.length_in}"` : ""}
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[styles.photoWrap, styles.noPhoto]}>
                  <Ionicons name="fish" size={48} color={COLORS.brandTertiary} />
                  <View style={styles.photoOverlayNoPhoto}>
                    <Text style={[styles.species, { color: COLORS.onSurface }]}>
                      {item.species}
                    </Text>
                    {(item.weight_lbs || item.length_in) && (
                      <Text style={[styles.meta, { color: COLORS.textMuted }]}>
                        {item.weight_lbs ? `${item.weight_lbs} lb` : ""}
                        {item.weight_lbs && item.length_in ? "  ·  " : ""}
                        {item.length_in ? `${item.length_in}"` : ""}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              <View style={styles.cardFooter}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
                    <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.footerText} numberOfLines={1}>
                      {item.location_name || "Unknown spot"}
                    </Text>
                  </View>
                  <Text style={styles.footerSub}>
                    {new Date(item.caught_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Pressable
                  testID={`delete-catch-${item.id}`}
                  hitSlop={10}
                  onPress={() => onDelete(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Pressable
        testID="add-catch-fab"
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/add-catch");
        }}
      >
        <Ionicons name="add" size={28} color={COLORS.onBrandPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  h1: { fontSize: TYPE.xxl, fontWeight: "800", color: COLORS.onSurface },
  sub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  emptyTitle: { fontSize: TYPE.xl, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.lg },
  emptySub: { fontSize: TYPE.base, color: COLORS.textMuted, marginTop: SPACING.xs },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoWrap: { width: "100%", height: 220, position: "relative" },
  noPhoto: {
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: "100%", height: "100%" },
  photoScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 110 },
  photoOverlay: { position: "absolute", left: SPACING.lg, right: SPACING.lg, bottom: SPACING.lg },
  photoOverlayNoPhoto: { marginTop: SPACING.md, alignItems: "center" },
  species: { color: "#FFF", fontSize: TYPE.xl, fontWeight: "800" },
  meta: { color: "rgba(255,255,255,0.85)", fontSize: TYPE.base, fontWeight: "600", marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  footerText: { fontSize: TYPE.base, fontWeight: "600", color: COLORS.onSurface },
  footerSub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2 },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
