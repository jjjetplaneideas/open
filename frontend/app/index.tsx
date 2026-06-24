import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { needsLegalAcceptance } from "@/src/legal";
import { useAuth } from "@/src/auth";
import { ensureLegacyKeysMigrated } from "@/src/storage-migration";
import { COLORS } from "@/src/theme";

/**
 * Root entry. Routing priority:
 *   1. If user has NOT accepted current legal docs   -> /onboarding
 *   2. If authenticated OR explicit guest-mode flag  -> /(tabs)
 *   3. Otherwise (mandatory)                         -> /login
 *
 * Also runs the one-time `fishcast.* -> anglerj.*` AsyncStorage migration
 * before the rest of the app boots, so no user data is lost on the rename.
 */
export default function Index() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const [needsLegal, setNeedsLegal] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLegacyKeysMigrated();
      const needs = await needsLegalAcceptance();
      setNeedsLegal(needs);
    })();
  }, []);

  if (needsLegal === null || authLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.surface,
        }}
      >
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (needsLegal) return <Redirect href="/onboarding" />;
  if (user || isGuest) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
