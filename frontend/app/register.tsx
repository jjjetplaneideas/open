import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { AnglerjMark } from "@/src/components/AnglerjMark";
import { AnglerjWordmark } from "@/src/components/AnglerjWordmark";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const { registerEmail, loginGoogle, loginApple, signingIn, error, clearError, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        /* ignore */
      }
    })();
  }, []);

  const onSubmit = useCallback(async () => {
    clearError();
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Use at least 8 characters.");
      return;
    }
    try {
      const migrated = await registerEmail(email, password, name || undefined);
      if (migrated && (migrated.spots > 0 || migrated.catches > 0)) {
        Alert.alert(
          "Account created",
          `We linked ${migrated.spots} spots and ${migrated.catches} catches from your guest session.`,
        );
      }
      router.replace("/(tabs)");
    } catch {
      /* surfaced via error state */
    }
  }, [email, password, name, registerEmail, router, clearError]);

  const onGoogle = useCallback(async () => {
    clearError();
    try {
      const migrated = await loginGoogle();
      if (migrated == null) return;
      if (migrated.spots > 0 || migrated.catches > 0) {
        Alert.alert(
          "Welcome aboard!",
          `Migrated ${migrated.spots} spots and ${migrated.catches} catches to your account.`,
        );
      }
      router.replace("/(tabs)");
    } catch {
      /* ignore */
    }
  }, [loginGoogle, router, clearError]);

  const onApple = useCallback(async () => {
    clearError();
    try {
      const migrated = await loginApple();
      if (migrated == null) return;
      router.replace("/(tabs)");
    } catch {
      /* ignore */
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
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} testID="register-close">
              <Ionicons name="close" size={24} color={COLORS.onSurface} />
            </Pressable>
            <AnglerjMark size={30} />
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.heroBox}>
            <AnglerjWordmark height={64} />
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Save your spots, catches, and preferences. We’ll migrate any guest data automatically.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Name (optional)</Text>
            <TextInput
              testID="register-name"
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="register-email"
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                testID="register-password"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="At least 8 characters"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoComplete="password-new"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.textMuted}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="register-submit"
              style={[styles.primaryBtn, signingIn && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={signingIn}
            >
              {signingIn ? (
                <ActivityIndicator color={COLORS.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Create Account</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign up with</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              testID="register-google"
              style={[styles.oauthBtn, signingIn && { opacity: 0.6 }]}
              onPress={onGoogle}
              disabled={signingIn}
            >
              <Ionicons name="logo-google" size={20} color={COLORS.onSurface} />
              <Text style={styles.oauthBtnText}>Sign up with Google</Text>
            </Pressable>

            {appleAvailable ? (
              <Pressable
                testID="register-apple"
                style={[styles.appleBtn, signingIn && { opacity: 0.6 }]}
                onPress={onApple}
                disabled={signingIn}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.appleBtnText}>Sign up with Apple</Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="go-login"
              style={styles.linkRow}
              onPress={() => router.replace("/login")}
            >
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkAccent}>Sign in</Text>
              </Text>
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
  brand: { color: COLORS.onSurface, fontSize: TYPE.lg, fontWeight: "700" },
  heroBox: { alignItems: "center", paddingVertical: SPACING.md, gap: SPACING.sm },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  title: { color: COLORS.onSurface, fontSize: TYPE.xxl, fontWeight: "700", textAlign: "center" },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: TYPE.base,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  form: { gap: SPACING.sm },
  label: { color: COLORS.textMuted, fontSize: TYPE.sm, fontWeight: "600", marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    color: COLORS.onSurface,
    fontSize: TYPE.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  eyeBtn: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "#3a1a1a",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  errorText: { color: COLORS.error, fontSize: TYPE.base, flex: 1 },
  primaryBtn: {
    backgroundColor: COLORS.brand,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: "center",
    marginTop: SPACING.md,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: TYPE.lg },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginVertical: SPACING.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textMuted, fontSize: TYPE.sm },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.surfaceSecondary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  oauthBtnText: { color: COLORS.onSurface, fontWeight: "600", fontSize: TYPE.lg },
  appleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: "#000",
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  appleBtnText: { color: "#fff", fontWeight: "600", fontSize: TYPE.lg },
  linkRow: { alignItems: "center", paddingVertical: SPACING.lg },
  linkText: { color: COLORS.textMuted, fontSize: TYPE.base },
  linkAccent: { color: COLORS.brand, fontWeight: "700" },
});
