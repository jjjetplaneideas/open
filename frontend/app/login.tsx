import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { AnglerjMark } from "@/src/components/AnglerjMark";
import { AnglerjWordmark } from "@/src/components/AnglerjWordmark";
import { BrandInput } from "@/src/components/BrandInput";
import { GradientButton } from "@/src/components/GradientButton";
import { TaglineBar } from "@/src/components/TaglineBar";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { loginEmail, loginGoogle, loginApple, signingIn, error, clearError, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== "ios") return;
      try {
        const AppleAuth = await import("expo-apple-authentication");
        setAppleAvailable(await AppleAuth.isAvailableAsync());
      } catch {
        setAppleAvailable(false);
      }
    })();
  }, []);

  // On web, auto-capture Google session_id from URL fragment
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;
    const has =
      (window.location.hash || "").includes("session_id") ||
      (window.location.search || "").includes("session_id");
    if (has) {
      loginGoogle()
        .then((m) => {
          if (m && (m.spots > 0 || m.catches > 0)) {
            Alert.alert(
              "Welcome aboard!",
              `Migrated ${m.spots} spots and ${m.catches} catches to your account.`,
            );
          }
          router.replace("/(tabs)");
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(async () => {
    clearError();
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    try {
      const m = await loginEmail(email, password);
      if (m && (m.spots > 0 || m.catches > 0)) {
        Alert.alert(
          "Welcome back!",
          `Linked ${m.spots} spots and ${m.catches} catches to your account.`,
        );
      }
      router.replace("/(tabs)");
    } catch {
      /* surfaced via error */
    }
  }, [email, password, loginEmail, router, clearError]);

  const onGoogle = useCallback(async () => {
    clearError();
    try {
      const m = await loginGoogle();
      if (m == null) return;
      if (m.spots > 0 || m.catches > 0) {
        Alert.alert(
          "Welcome aboard!",
          `Migrated ${m.spots} spots and ${m.catches} catches to your account.`,
        );
      }
      router.replace("/(tabs)");
    } catch {
      /* surfaced via error */
    }
  }, [loginGoogle, router, clearError]);

  const onApple = useCallback(async () => {
    clearError();
    try {
      const m = await loginApple();
      if (m == null) return;
      router.replace("/(tabs)");
    } catch {
      /* surfaced via error */
    }
  }, [loginApple, router, clearError]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} testID="login-close">
              <Ionicons name="close" size={26} color={COLORS.onSurface} />
            </Pressable>
            <AnglerjMark size={32} />
            <View style={{ width: 26 }} />
          </View>

          <View style={styles.heroBox}>
            <AnglerjWordmark height={62} />
            <TaglineBar style={{ marginTop: SPACING.lg }} />
          </View>

          <View style={styles.form}>
            <BrandInput
              testID="login-email"
              iconName="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
            <BrandInput
              testID="login-password"
              iconName="lock-closed-outline"
              togglePassword
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              containerStyle={{ marginTop: SPACING.md }}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <GradientButton
              testID="login-submit"
              label="Sign In"
              onPress={onSubmit}
              loading={signingIn}
              style={{ marginTop: SPACING.lg }}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              testID="login-google"
              style={[styles.socialBtn, signingIn && { opacity: 0.6 }]}
              onPress={onGoogle}
              disabled={signingIn}
            >
              <Ionicons name="logo-google" size={20} color={COLORS.onSurface} />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </Pressable>

            {appleAvailable ? (
              <Pressable
                testID="login-apple"
                style={[styles.appleBtn, signingIn && { opacity: 0.6 }]}
                onPress={onApple}
                disabled={signingIn}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.appleBtnText}>Continue with Apple</Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="go-register"
              style={styles.linkRow}
              onPress={() => router.push("/register")}
            >
              <Text style={styles.linkText}>
                Don’t have an account? <Text style={styles.linkAccent}>Create one</Text>
              </Text>
            </Pressable>

            <Pressable
              testID="continue-as-guest"
              style={styles.guestBtn}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={styles.guestText}>Continue as guest</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  container: { padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.lg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACING.sm,
  },
  heroBox: { alignItems: "center", paddingVertical: SPACING.md },
  form: { gap: SPACING.sm },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(243, 139, 130, 0.12)",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: "rgba(243, 139, 130, 0.35)",
  },
  errorText: { color: COLORS.error, fontSize: TYPE.base, flex: 1 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginVertical: SPACING.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textMuted, fontSize: TYPE.sm },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
  },
  socialBtnText: { color: COLORS.onSurface, fontWeight: "600", fontSize: TYPE.lg },
  appleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: "#000",
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: SPACING.sm,
  },
  appleBtnText: { color: "#fff", fontWeight: "600", fontSize: TYPE.lg },
  linkRow: { alignItems: "center", paddingVertical: SPACING.lg },
  linkText: { color: COLORS.textMuted, fontSize: TYPE.base },
  linkAccent: { color: COLORS.brand, fontWeight: "700" },
  guestBtn: { alignItems: "center", paddingVertical: SPACING.md },
  guestText: { color: COLORS.brand, fontSize: TYPE.base, textDecorationLine: "underline" },
});
