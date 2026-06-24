import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, RADIUS, SPACING, TYPE } from "../theme";

export type FreshnessBlock = {
  now?: string;
  weather?: { last_updated?: string; next_refresh?: string; age_minutes?: number; status?: string };
  tide?: { last_calculated?: string; next_refresh?: string; status?: string };
  swell?: { last_updated?: string; next_refresh?: string; status?: string };
  moon_solunar?: { generated_at?: string; status?: string };
  anglerjai?: { generated_at?: string; status?: string };
  conditions_timestamp?: string;
  overall_status?: "live" | "delayed" | "stale" | "unavailable";
};

function fmtTime(iso?: string): string {
  if (!iso) return "--:--";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function statusMeta(status?: string) {
  switch (status) {
    case "live":
      return { color: COLORS.brandSecondary, icon: "checkmark-circle" as const, label: "All Systems Current" };
    case "delayed":
      return { color: COLORS.warning, icon: "time-outline" as const, label: "Slight Delay" };
    case "stale":
      return { color: COLORS.warning, icon: "alert-circle" as const, label: "Data Stale" };
    case "unavailable":
      return { color: COLORS.error, icon: "cloud-offline" as const, label: "Limited Data" };
    default:
      return { color: COLORS.info, icon: "ellipsis-horizontal" as const, label: "Checking" };
  }
}

/**
 * Single-line freshness ribbon used at the top of the dashboard.
 *
 * Renders as:   "All Systems Current — Weather updated 3:23 PM, next check 3:38 PM"
 *
 * Tap to expand a per-source breakdown sheet.
 */
export function FreshnessRibbon({ data }: { data: FreshnessBlock | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const [, force] = useState(0);

  // Re-render every 30s so "X min ago" stays fresh between forecast pulls
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;
  const meta = statusMeta(data.overall_status);
  const w = data.weather || {};
  const t = data.tide || {};
  const s = data.swell || {};
  const m = data.moon_solunar || {};
  const ai = data.anglerjai || {};

  return (
    <Pressable
      testID="freshness-ribbon"
      style={[styles.ribbon, { borderColor: meta.color }]}
      onPress={() => setExpanded((v) => !v)}
      hitSlop={4}
    >
      <View style={styles.row}>
        <Ionicons name={meta.icon} size={14} color={meta.color} />
        <Text style={[styles.headline, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.sep}>—</Text>
        <Text style={styles.detail}>
          Weather {fmtTime(w.last_updated)}, next {fmtTime(w.next_refresh)}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          color={COLORS.textMuted}
          style={{ marginLeft: "auto" }}
        />
      </View>

      {expanded ? (
        <View style={styles.expanded}>
          <FreshRow label="Weather" status={w.status} timeStr={fmtTime(w.last_updated)} next={fmtTime(w.next_refresh)} />
          <FreshRow label="Tide" status={t.status} timeStr={fmtTime(t.last_calculated)} next={fmtTime(t.next_refresh)} />
          <FreshRow label="Swell" status={s.status} timeStr={fmtTime(s.last_updated)} next={fmtTime(s.next_refresh)} />
          <FreshRow label="Moon · Solunar" status={m.status} timeStr={fmtTime(m.generated_at)} next="local" />
          <FreshRow label="AnglerjAi" status={ai.status} timeStr={fmtTime(ai.generated_at)} next="on demand" />
        </View>
      ) : null}
    </Pressable>
  );
}

function FreshRow({
  label,
  status,
  timeStr,
  next,
}: {
  label: string;
  status?: string;
  timeStr: string;
  next: string;
}) {
  const meta = statusMeta(status);
  return (
    <View style={styles.fRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
        <Ionicons name={meta.icon} size={12} color={meta.color} />
        <Text style={styles.fLabel}>{label}</Text>
      </View>
      <Text style={styles.fTime}>
        {timeStr}
        <Text style={styles.fMuted}>  · next {next}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  headline: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  sep: { color: COLORS.textMuted, fontSize: 12 },
  detail: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
  expanded: { marginTop: SPACING.md, gap: 6, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  fRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fLabel: { color: COLORS.onSurface, fontSize: TYPE.sm, fontWeight: "600" },
  fTime: { color: COLORS.onSurface, fontSize: TYPE.sm, fontWeight: "600" },
  fMuted: { color: COLORS.textMuted, fontWeight: "400", fontSize: 11 },
});

export default FreshnessRibbon;
