import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import {
  api,
  getOrCreateUserId,
  getSavedLocation,
  setSavedLocation,
  Spot,
} from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function SpotsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const uid = await getOrCreateUserId();
    try {
      const r = await api.listSpots(uid);
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

  const addCurrent = async () => {
    setError("");
    const cur = await getSavedLocation();
    if (!cur) {
      setError("Set your location first on the Today tab.");
      return;
    }
    if (!name.trim()) {
      setError("Give this spot a name.");
      return;
    }
    setCreating(true);
    try {
      const uid = await getOrCreateUserId();
      const created = await api.createSpot({
        user_id: uid,
        name: name.trim(),
        lat: cur.lat,
        lon: cur.lon,
        notes: "",
      });
      setItems((prev) => [created, ...prev]);
      setName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message || "Could not save spot");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = (id: string) => {
    Alert.alert("Delete spot?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const uid = await getOrCreateUserId();
          try {
            await api.deleteSpot(id, uid);
            setItems((prev) => prev.filter((s) => s.id !== id));
          } catch {
            // ignore
          }
        },
      },
    ]);
  };

  const usePin = async (s: Spot) => {
    await setSavedLocation({ lat: s.lat, lon: s.lon, display: s.name, source: "manual" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-spots" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Saved Spots</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.addBox}>
          <Text style={styles.addLabel}>Save current location as a spot</Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="spot-name-input"
              style={styles.input}
              placeholder='e.g. "Cedar Lake — north dock"'
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={addCurrent}
            />
            <Pressable
              testID="save-spot-button"
              onPress={addCurrent}
              disabled={creating}
              style={styles.saveBtn}
            >
              {creating ? (
                <ActivityIndicator color={COLORS.onBrandPrimary} size="small" />
              ) : (
                <Ionicons name="add" size={20} color={COLORS.onBrandPrimary} />
              )}
            </Pressable>
          </View>
          {error ? <Text style={styles.errText}>{error}</Text> : null}
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.xl }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No saved spots yet</Text>
            <Text style={styles.emptySub}>
              Save your favorite fishing locations to quickly switch between them.
            </Text>
          </View>
        ) : (
          <FlatList
            testID="spots-list"
            data={items}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`spot-${item.id}`}>
                <Pressable style={{ flex: 1 }} onPress={() => usePin(item)}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSub}>
                    {item.lat.toFixed(3)}, {item.lon.toFixed(3)}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`delete-spot-${item.id}`}
                  hitSlop={10}
                  onPress={() => onDelete(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </Pressable>
              </View>
            )}
          />
        )}
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
  addBox: { padding: SPACING.lg, gap: SPACING.sm },
  addLabel: { fontSize: TYPE.sm, color: COLORS.textMuted, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingLeft: SPACING.md,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: { flex: 1, fontSize: TYPE.base, color: COLORS.onSurface, paddingVertical: SPACING.sm },
  saveBtn: {
    backgroundColor: COLORS.brand,
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  errText: { color: COLORS.error, fontSize: TYPE.sm },
  empty: { padding: SPACING.xxl, alignItems: "center" },
  emptyTitle: { fontSize: TYPE.lg, fontWeight: "700", color: COLORS.onSurface, marginTop: SPACING.md },
  emptySub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: SPACING.xs, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceSecondary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowTitle: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  rowSub: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2 },
});
