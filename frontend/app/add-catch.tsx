import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { api, getOrCreateUserId, getSavedLocation } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";
import { weightToLbs, lengthToIn, weightUnit, lengthUnit, useUnits } from "@/src/units";

export default function AddCatchScreen() {
  const router = useRouter();
  const { units } = useUnits();
  const [species, setSpecies] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [notes, setNotes] = useState("");
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      setError("Photo library permission denied.");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });
    if (!r.canceled && r.assets[0]?.base64) {
      setPhotoB64(r.assets[0].base64);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      setError("Camera permission denied.");
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });
    if (!r.canceled && r.assets[0]?.base64) {
      setPhotoB64(r.assets[0].base64);
    }
  };

  const save = async () => {
    setError("");
    if (!species.trim()) {
      setError("Enter the species.");
      return;
    }
    setSaving(true);
    try {
      const uid = await getOrCreateUserId();
      const cur = await getSavedLocation();
      await api.createCatch({
        user_id: uid,
        species: species.trim(),
        weight_lbs: weight ? weightToLbs(parseFloat(weight), units) : undefined,
        length_in: length ? lengthToIn(parseFloat(length), units) : undefined,
        notes: notes.trim(),
        location_name: cur?.display || "",
        lat: cur?.lat,
        lon: cur?.lon,
        photo_base64: photoB64 || "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      setError(e?.message || "Could not save catch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Pressable testID="close-add-catch" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Log a Catch</Text>
        <Pressable
          testID="save-catch-button"
          hitSlop={10}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.brand} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}>
          {/* Photo */}
          {photoB64 ? (
            <Pressable onPress={pickPhoto} style={styles.photoBox}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${photoB64}` }}
                style={{ width: "100%", height: 220, borderRadius: RADIUS.md }}
                contentFit="cover"
              />
              <Text style={styles.photoHint}>Tap to change</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: SPACING.md }}>
              <Pressable
                testID="take-photo-button"
                style={[styles.photoCta, { flex: 1 }]}
                onPress={takePhoto}
              >
                <Ionicons name="camera-outline" size={24} color={COLORS.brand} />
                <Text style={styles.photoCtaText}>Take Photo</Text>
              </Pressable>
              <Pressable
                testID="pick-photo-button"
                style={[styles.photoCta, { flex: 1 }]}
                onPress={pickPhoto}
              >
                <Ionicons name="images-outline" size={24} color={COLORS.brand} />
                <Text style={styles.photoCtaText}>Choose Photo</Text>
              </Pressable>
            </View>
          )}

          <Field label="Species *">
            <TextInput
              testID="species-input"
              style={styles.input}
              placeholder="Largemouth Bass"
              placeholderTextColor={COLORS.textMuted}
              value={species}
              onChangeText={setSpecies}
            />
          </Field>
          <View style={{ flexDirection: "row", gap: SPACING.md }}>
            <View style={{ flex: 1 }}>
              <Field label={`Weight (${weightUnit(units)})`}>
                <TextInput
                  testID="weight-input"
                  style={styles.input}
                  placeholder={units === "metric" ? "1.2" : "2.5"}
                  placeholderTextColor={COLORS.textMuted}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={`Length (${lengthUnit(units)})`}>
                <TextInput
                  testID="length-input"
                  style={styles.input}
                  placeholder={units === "metric" ? "36" : "14"}
                  placeholderTextColor={COLORS.textMuted}
                  value={length}
                  onChangeText={setLength}
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
          </View>
          <Field label="Notes">
            <TextInput
              testID="notes-input"
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Lure used, water depth, weather..."
              placeholderTextColor={COLORS.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Field>

          {error ? <Text style={{ color: COLORS.error }}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
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
  saveText: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.brand },
  photoBox: { borderRadius: RADIUS.md, overflow: "hidden" },
  photoHint: {
    position: "absolute",
    bottom: SPACING.sm,
    right: SPACING.sm,
    color: "#FFF",
    fontSize: TYPE.sm,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  photoCta: {
    backgroundColor: COLORS.brandTertiary,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    alignItems: "center",
    gap: SPACING.xs,
  },
  photoCtaText: { fontSize: TYPE.sm, fontWeight: "700", color: COLORS.onBrandTertiary },
  fieldLabel: {
    fontSize: TYPE.sm,
    fontWeight: "700",
    color: COLORS.onSurface,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPE.base,
    color: COLORS.onSurface,
  },
});
