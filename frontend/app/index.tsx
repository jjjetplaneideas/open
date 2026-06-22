import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { needsLegalAcceptance } from "@/src/legal";
import { COLORS } from "@/src/theme";

export default function Index() {
  const [needs, setNeeds] = useState<boolean | null>(null);
  useEffect(() => {
    needsLegalAcceptance().then(setNeeds);
  }, []);
  if (needs === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }
  return <Redirect href={needs ? "/onboarding" : "/(tabs)"} />;
}
