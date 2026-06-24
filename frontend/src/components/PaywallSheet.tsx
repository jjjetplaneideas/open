import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useSubscription, PRODUCTS } from "@/src/subscription";
import { AnglerjMark } from "@/src/components/AnglerjMark";
import { TaglineBar } from "@/src/components/TaglineBar";
import { GradientButton } from "@/src/components/GradientButton";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

const PRO_FEATURES = [
  "AnglerjAi unlimited forecasts & explanations",
  "AnglerjAi Bite Prediction (hourly + 7-day)",
  "AnglerjAi Smart Spots & species recommendations",
  "AnglerjAi Local Almanac & Assistant",
  "Premium tide, swell & solunar layers",
  "Unlimited saved spots and catch log",
  "Ad-free experience across the app",
];
const FOUNDER_EXTRAS = [
  "Lifetime access — pay once, fish forever",
  "Founder badge on profile & catch log",
  "Early access to new AnglerjAi modules",
  "Direct line to the build team",
];

type TierCardProps = {
  productKey: keyof typeof PRODUCTS;
  title: string;
  badge?: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  busy: boolean;
  onPress: () => void;
};

function TierCard({
  productKey,
  title,
  badge,
  price,
  cadence,
  highlight,
  busy,
  onPress,
}: TierCardProps) {
  return (
    <Pressable
      testID={`paywall-tier-${productKey}`}
      onPress={onPress}
      disabled={busy}
      style={[styles.tierCard, highlight && styles.tierCardHighlight]}
    >
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.tierTitle}>{title}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.priceText}>{price}</Text>
        <Text style={styles.cadence}>{cadence}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={COLORS.brand} style={{ marginTop: SPACING.md }} />
      ) : (
        <View style={styles.tierCta}>
          <Text style={styles.tierCtaText}>Select</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.brand} />
        </View>
      )}
    </Pressable>
  );
}

type Props = {
  onClose: () => void;
};

export function PaywallSheet({ onClose }: Props) {
  const {
    offerings,
    tier,
    isPremium,
    purchase,
    restore,
    busy,
    error,
    clearError,
    nativeAvailable,
  } = useSubscription();

  // Prefer live RC offerings; fall back to the planned defaults shipped in V1.
  const monthly = offerings.monthly || { priceString: "$4.99" } as any;
  const yearly = offerings.yearly || { priceString: "$39.99" } as any;
  const lifetime = offerings.lifetime || { priceString: "$99" } as any;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onClose} hitSlop={12} testID="paywall-close">
          <Ionicons name="close" size={26} color={COLORS.onSurface} />
        </Pressable>
        <AnglerjMark size={32} />
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>UNLOCK ANGLERJ PRO</Text>
        <Text style={styles.headline}>Make every cast count.</Text>
        <TaglineBar style={{ marginTop: SPACING.md }} />
      </View>

      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Ionicons name="sparkles" size={18} color={COLORS.brandSecondary} />
          <Text style={styles.featureTitle}>Anglerj Pro includes</Text>
        </View>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.brandSecondary} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>
      <View style={{ gap: SPACING.md }}>
        <TierCard
          productKey="yearly"
          title="Anglerj Pro · Annual"
          badge="BEST VALUE · SAVE 40%"
          price={yearly.priceString || "$49.99"}
          cadence="per year"
          highlight
          busy={busy}
          onPress={() => purchase("yearly")}
        />
        <TierCard
          productKey="monthly"
          title="Anglerj Pro · Monthly"
          price={monthly.priceString || "$6.99"}
          cadence="per month"
          busy={busy}
          onPress={() => purchase("monthly")}
        />
        <View style={[styles.tierCard, styles.founderCard]}>
          <LinearGradient
            colors={["rgba(0, 224, 194, 0.15)", "rgba(30, 167, 255, 0.05)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.founderBadge}>
            <Ionicons name="star" size={11} color={COLORS.onSurface} />
            <Text style={styles.founderBadgeText}>FOUNDER</Text>
          </View>
          <Text style={styles.tierTitle}>Anglerj Founder · Lifetime</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>{lifetime.priceString || "$199"}</Text>
            <Text style={styles.cadence}>once · lifetime</Text>
          </View>
          {FOUNDER_EXTRAS.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.brandSecondary} />
              <Text style={[styles.featureText, { fontSize: TYPE.sm }]}>{f}</Text>
            </View>
          ))}
          <Pressable
            testID="paywall-tier-lifetime"
            onPress={() => purchase("lifetime")}
            disabled={busy}
            style={{ marginTop: SPACING.md }}
          >
            <GradientButton
              testID="paywall-tier-lifetime-cta"
              label={busy ? "Processing…" : "Become a Founder"}
              loading={busy}
              onPress={() => purchase("lifetime")}
            />
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={clearError} hitSlop={8}>
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {!nativeAvailable ? (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={COLORS.brand} />
          <Text style={styles.infoText}>
            Subscriptions require an iOS/Android development or production build. On web and
            Expo Go you can preview the paywall but cannot complete a purchase.
          </Text>
        </View>
      ) : null}

      <Pressable testID="paywall-restore" style={styles.restoreBtn} onPress={restore} disabled={busy}>
        <Ionicons name="refresh" size={14} color={COLORS.brand} />
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </Pressable>

      <Text style={styles.legalText}>
        Plans auto-renew until canceled. Manage or cancel anytime in your account settings.
        Current tier: <Text style={{ color: COLORS.brand, fontWeight: "700" }}>{tier.toUpperCase()}</Text>
        {isPremium ? " — thank you!" : ""}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.lg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACING.sm,
  },
  hero: { alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
  kicker: { color: COLORS.brand, fontWeight: "700", letterSpacing: 2, fontSize: 11 },
  headline: { color: COLORS.onSurface, fontSize: 28, fontWeight: "800", textAlign: "center" },
  featureCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    gap: SPACING.sm,
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  featureTitle: { color: COLORS.onSurface, fontSize: TYPE.lg, fontWeight: "700" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  featureText: { color: COLORS.onSurface, fontSize: TYPE.base, flex: 1 },
  sectionLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  tierCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  tierCardHighlight: { borderColor: COLORS.brand, borderWidth: 2 },
  founderCard: { borderColor: COLORS.brandSecondary, borderWidth: 1.5, gap: 4 },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  badgeText: { color: COLORS.onBrandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  founderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: COLORS.brandSecondary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.xs,
  },
  founderBadgeText: { color: COLORS.onSurface, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  tierTitle: { color: COLORS.onSurface, fontSize: TYPE.lg, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm, marginTop: 4 },
  priceText: { color: COLORS.onSurface, fontSize: 28, fontWeight: "800" },
  cadence: { color: COLORS.textMuted, fontSize: TYPE.base, fontWeight: "600" },
  tierCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: SPACING.md,
    alignSelf: "flex-end",
  },
  tierCtaText: { color: COLORS.brand, fontWeight: "700", fontSize: TYPE.base },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(243, 139, 130, 0.12)",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(243, 139, 130, 0.35)",
  },
  errorText: { color: COLORS.error, fontSize: TYPE.base, flex: 1 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: "rgba(30, 167, 255, 0.08)",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
  },
  infoText: { color: COLORS.textMuted, fontSize: TYPE.sm, flex: 1, lineHeight: 18 },
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  restoreText: { color: COLORS.brand, fontWeight: "700", fontSize: TYPE.base },
  legalText: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: SPACING.md,
    lineHeight: 16,
  },
});
