import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGAL_KEY = "fishcast.legal_acceptance";

export const CURRENT_LEGAL = {
  tos: "1.0.0",
  privacy: "1.0.0",
  waiver: "1.0.0",
};

export type LegalAcceptance = {
  tos: string;
  privacy: string;
  waiver: string;
  accepted_at: string;
};

export async function getLegalAcceptance(): Promise<LegalAcceptance | null> {
  const raw = await AsyncStorage.getItem(LEGAL_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setLegalAcceptance(a: LegalAcceptance) {
  await AsyncStorage.setItem(LEGAL_KEY, JSON.stringify(a));
}

export async function needsLegalAcceptance(): Promise<boolean> {
  const a = await getLegalAcceptance();
  if (!a) return true;
  return (
    a.tos !== CURRENT_LEGAL.tos ||
    a.privacy !== CURRENT_LEGAL.privacy ||
    a.waiver !== CURRENT_LEGAL.waiver
  );
}

// ====== Legal Document Text ======
export const LEGAL_DOCS = {
  tos: {
    title: "Terms of Service",
    version: CURRENT_LEGAL.tos,
    body: `By using FishCast, you agree to these Terms of Service. FishCast is a fishing forecast and intelligence tool. The information provided — including fishing scores, species recommendations, tide and swell data, weather, and AI-generated summaries — is informational only.

You may not scrape, reverse engineer, copy, redistribute, or commercially reuse the FishCast forecasting algorithms, fish almanac, AI reports, score models, or proprietary databases without express written permission.

FishCast is provided "as is" without warranty of any kind. We may change features, pricing, and content at any time.`,
  },
  privacy: {
    title: "Privacy Policy",
    version: CURRENT_LEGAL.privacy,
    body: `FishCast collects only the data needed to deliver forecasts: your selected location coordinates, saved spots, catch journal entries, unit preferences, and anonymous app usage analytics.

Your saved fishing spots and catch journal are stored privately and are not shared publicly. We do not sell personal data.

You may export your catch journal or delete your data at any time from Settings.`,
  },
  waiver: {
    title: "Liability Waiver & Assumption of Risk",
    version: CURRENT_LEGAL.waiver,
    body: `Fishing, boating, kayaking, wading, swimming, surf fishing, pier fishing, offshore travel, and outdoor activity involve real risks, including injury, death, drowning, lightning, severe weather, boat accidents, slips, wildlife encounters, marine hazards, equipment failure, rip currents, dangerous surf, and navigation errors.

FishCast is an informational tool only. We do not guarantee:
• Catch rates or species availability
• Safe weather or marine conditions
• Accurate navigation or safe routes
• Safe shoreline access or fishing locations

You accept full responsibility for your fishing, boating, navigation, travel, equipment, harvest, and safety decisions, and for compliance with all applicable laws and regulations. FishCast maps are not navigation systems; use official nautical charts and marine electronics.

Regulations may change without notice. Official state and federal agencies remain the authoritative source. Always verify current regulations before harvesting fish.`,
  },
};
