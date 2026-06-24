import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { CURRENT_LEGAL, LEGAL_DOCS, setLegalAcceptance, needsLegalAcceptance } from "@/src/legal";
import { AnglerjMark } from "@/src/components/AnglerjMark";
import { AnglerjWordmark } from "@/src/components/AnglerjWordmark";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const [tos, setTos] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("waiver");

  useEffect(() => {
    (async () => {
      // If user already accepted current versions, bounce them to Today
      const needs = await needsLegalAcceptance();
      if (!needs) router.replace("/(tabs)");
    })();
  }, [router]);

  const allAccepted = tos && privacy && waiver;

  const onContinue = async () => {
    if (!allAccepted) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setLegalAcceptance({
      tos: CURRENT_LEGAL.tos,
      privacy: CURRENT_LEGAL.privacy,
      waiver: CURRENT_LEGAL.waiver,
      accepted_at: new Date().toISOString(),
    });
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <View style={[styles.heroIconWrap, { alignItems: "center", marginBottom: 4 }]}>
          <AnglerjWordmark height={180} fullLockup />
        </View>
        <Text style={styles.subtitle}>
          Forecasts, conditions, almanac, and safety in one place.
        </Text>

        <Text style={styles.sectionLabel}>BEFORE WE START</Text>
        <Text style={styles.sectionHint}>
          Please review and accept the following. Tap each one to read.
        </Text>

        <LegalRow
          docKey="waiver"
          checked={waiver}
          onToggle={setWaiver}
          expanded={expanded === "waiver"}
          onExpand={() => setExpanded(expanded === "waiver" ? null : "waiver")}
        />
        <LegalRow
          docKey="tos"
          checked={tos}
          onToggle={setTos}
          expanded={expanded === "tos"}
          onExpand={() => setExpanded(expanded === "tos" ? null : "tos")}
        />
        <LegalRow
          docKey="privacy"
          checked={privacy}
          onToggle={setPrivacy}
          expanded={expanded === "privacy"}
          onExpand={() => setExpanded(expanded === "privacy" ? null : "privacy")}
        />

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.info} />
          <Text style={styles.noticeText}>
            Anglerj is informational only. Always use official charts, regulations, and your own
            judgment. Conditions change rapidly — your safety is your responsibility.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="accept-continue-button"
          onPress={onContinue}
          disabled={!allAccepted}
          style={[styles.continueBtn, !allAccepted && styles.continueBtnDisabled]}
        >
          <Text style={styles.continueText}>
            {allAccepted ? "Accept & Continue" : "Accept all to continue"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function LegalRow({
  docKey, checked, onToggle, expanded, onExpand,
}: {
  docKey: "tos" | "privacy" | "waiver";
  checked: boolean;
  onToggle: (v: boolean) => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const doc = LEGAL_DOCS[docKey];
  return (
    <View style={[styles.legalCard, checked && styles.legalCardChecked]} testID={`legal-row-${docKey}`}>
      <Pressable onPress={onExpand} style={styles.legalHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.legalTitle}>{doc.title}</Text>
          <Text style={styles.legalVersion}>v{doc.version}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
      </Pressable>
      {expanded && <Text style={styles.legalBody}>{doc.body}</Text>}
      <View style={styles.legalAccept}>
        <Text style={styles.legalAcceptText}>I have read and accept the {doc.title}</Text>
        <Switch
          testID={`legal-switch-${docKey}`}
          value={checked}
          onValueChange={(v) => {
            if (v) Haptics.selectionAsync();
            onToggle(v);
          }}
          trackColor={{ true: COLORS.brand, false: COLORS.borderStrong }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroIconWrap: {
    alignSelf: "center",
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.brandTertiary,
    alignItems: "center", justifyContent: "center",
    marginTop: SPACING.lg, marginBottom: SPACING.lg,
  },
  title: { fontSize: TYPE.xxl, fontWeight: "800", color: COLORS.onSurface, textAlign: "center" },
  subtitle: {
    fontSize: TYPE.base, color: COLORS.textMuted,
    textAlign: "center", marginTop: SPACING.sm, marginBottom: SPACING.xxl,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", color: COLORS.textMuted,
    letterSpacing: 1.5, marginBottom: SPACING.xs,
  },
  sectionHint: { fontSize: TYPE.sm, color: COLORS.textMuted, marginBottom: SPACING.md },
  legalCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  legalCardChecked: { borderColor: COLORS.brand, borderWidth: 2 },
  legalHead: { flexDirection: "row", alignItems: "center" },
  legalTitle: { fontSize: TYPE.base, fontWeight: "700", color: COLORS.onSurface },
  legalVersion: { fontSize: TYPE.sm, color: COLORS.textMuted, marginTop: 2 },
  legalBody: {
    fontSize: TYPE.sm, color: COLORS.onSurfaceTertiary,
    lineHeight: 20, marginTop: SPACING.md,
    backgroundColor: COLORS.surface, padding: SPACING.md, borderRadius: RADIUS.sm,
  },
  legalAccept: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: SPACING.md,
  },
  legalAcceptText: { flex: 1, fontSize: TYPE.sm, color: COLORS.onSurface, fontWeight: "600" },
  noticeBox: {
    flexDirection: "row", gap: SPACING.sm,
    backgroundColor: COLORS.surfaceTertiary, padding: SPACING.md,
    borderRadius: RADIUS.md, marginTop: SPACING.md,
  },
  noticeText: { flex: 1, fontSize: TYPE.sm, color: COLORS.onSurfaceTertiary, lineHeight: 18 },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.lg, paddingBottom: 32, paddingTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  continueBtn: {
    backgroundColor: COLORS.brand, paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill, alignItems: "center",
  },
  continueBtnDisabled: { backgroundColor: COLORS.borderStrong },
  continueText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: TYPE.lg },
});
