import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { PaywallSheet } from "@/src/components/PaywallSheet";
import { COLORS } from "@/src/theme";

export default function PaywallScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <PaywallSheet onClose={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
});
