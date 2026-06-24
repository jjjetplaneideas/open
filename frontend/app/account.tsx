import React, { useCallback } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { AnglerjMark } from "@/src/components/AnglerjMark";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const onLogout = useCallback(() => {
    Alert.alert(
      "Sign out?",
      "You’ll need to sign in again to sync your data across devices.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(tabs)");
          },
        },
      ],
    );
  }, [logout, router]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.onSurface} />
          </Pressable>
          <Text style={styles.title}>Account</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.guestBox}>
          <AnglerjMark size={88} />
          <Text style={styles.guestTitle}>You’re using Anglerj as a guest</Text>
          <Text style={styles.guestText}>
            Sign in to back up your spots and catches, sync across devices, and unlock Premium
            features.
          </Text>
          <Pressable
            testID="go-login"
            style={styles.primaryBtn}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </Pressable>
          <Pressable
            testID="go-register"
            style={styles.outlineBtn}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.outlineBtnText}>Create Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const initials = (user.name || user.email || "A")
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user.name || "Angler"}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.providerRow}>
            <Ionicons
              name={
                user.auth_provider === "google"
                  ? "logo-google"
                  : user.auth_provider === "apple"
                  ? "logo-apple"
                  : "mail-outline"
              }
              size={14}
              color={COLORS.textMuted}
            />
            <Text style={styles.providerText}>
              Signed in via {user.auth_provider === "google" ? "Google" : user.auth_provider === "apple" ? "Apple" : "Email"}
            </Text>
          </View>
        </View>

        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Plan</Text>
            <Text style={styles.statusValue}>{user.is_premium ? "Premium Angler" : "Free"}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Member since</Text>
            <Text style={styles.statusValue}>
              {new Date(user.created_at).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>User ID</Text>
            <Text style={[styles.statusValue, { fontSize: TYPE.sm }]}>{user.user_id}</Text>
          </View>
        </View>

        <Pressable testID="logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  title: { color: COLORS.onSurface, fontSize: TYPE.lg, fontWeight: "700" },
  guestBox: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  guestTitle: { color: COLORS.onSurface, fontSize: TYPE.xl, fontWeight: "700", textAlign: "center" },
  guestText: {
    color: COLORS.textMuted,
    fontSize: TYPE.base,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  primaryBtn: {
    backgroundColor: COLORS.brand,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.md,
    alignItems: "center",
    width: "100%",
    marginTop: SPACING.md,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.lg },
  outlineBtn: {
    backgroundColor: "transparent",
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outlineBtnText: { color: COLORS.onSurface, fontWeight: "600", fontSize: TYPE.lg },
  profileCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  avatarText: { color: COLORS.onBrandPrimary, fontSize: 32, fontWeight: "700" },
  name: { color: COLORS.onSurface, fontSize: TYPE.xxl, fontWeight: "700" },
  email: { color: COLORS.textMuted, fontSize: TYPE.base },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  providerText: { color: COLORS.textMuted, fontSize: TYPE.sm },
  statusBox: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SPACING.sm },
  statusLabel: { color: COLORS.textMuted, fontSize: TYPE.base },
  statusValue: { color: COLORS.onSurface, fontSize: TYPE.base, fontWeight: "600" },
  divider: { height: 1, backgroundColor: COLORS.divider },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: "transparent",
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    marginTop: SPACING.lg,
  },
  logoutText: { color: COLORS.error, fontWeight: "600", fontSize: TYPE.lg },
});
