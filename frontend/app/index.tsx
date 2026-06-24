import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { needsLegalAcceptance } from "@/src/legal";
import { useAuth } from "@/src/auth";
import { COLORS } from "@/src/theme";

/**
 * Root entry. Routing priority:
 *   1. If user has NOT accepted current legal docs   -> /onboarding
 *   2. If authenticated OR explicit guest-mode flag  -> /(tabs)
 *   3. Otherwise (mandatory)                         -> /login
 *
 * The "Remember me" toggle on /login decides whether the access token is
 * persisted across cold-starts; if not, the AuthProvider clears the token
 * on boot and we end up back on /login next launch.
 *
 * "Continue as guest" sets a persistent flag so the guest path is sticky
 * until they explicitly Sign In or Log Out from inside the app.
 */
export default function Index() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const [needsLegal, setNeedsLegal] = useState<boolean | null>(null);

  useEffect(() => {
    needsLegalAcceptance().then(setNeedsLegal);
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
