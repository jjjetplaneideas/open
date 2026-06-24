import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";

import { useAuth } from "./auth";

// =============================================================================
// Tier model
// =============================================================================
export type Tier = "free" | "pro" | "founder";

export const ENTITLEMENT_PRO = "pro";
export const ENTITLEMENT_FOUNDER = "founder";

export const PRODUCTS = {
  monthly: "monthly",   // -> entitlement "pro"
  yearly: "yearly",     // -> entitlement "pro"  (best value)
  lifetime: "lifetime", // -> entitlement "founder" (implies pro)
} as const;

export type ProductId = typeof PRODUCTS[keyof typeof PRODUCTS];

// =============================================================================
// Native module loader (gracefully no-op on web / Expo Go)
// =============================================================================
let PurchasesNative: any = null;
let PurchasesUiNative: any = null;
let NATIVE_AVAILABLE = false;

// We only attempt to load the native module on iOS / Android — never on web.
// We also guard for the case where the dev build hasn't been generated yet
// (running inside Expo Go) by catching the require() failure.
if (Platform.OS === "ios" || Platform.OS === "android") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    PurchasesNative = require("react-native-purchases").default;
    NATIVE_AVAILABLE = true;
  } catch (_e) {
    PurchasesNative = null;
    NATIVE_AVAILABLE = false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    PurchasesUiNative = require("react-native-purchases-ui").default;
  } catch (_e) {
    PurchasesUiNative = null;
  }
}

// =============================================================================
// Context
// =============================================================================
export type Offering = {
  identifier: string;
  productId: ProductId;
  priceString: string;
  title: string;
  description: string;
  rawPackage?: any;
};

export type SubscriptionState = {
  tier: Tier;
  isPremium: boolean;
  isPro: boolean;
  isFounder: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  offerings: { monthly?: Offering; yearly?: Offering; lifetime?: Offering };
  nativeAvailable: boolean; // false on web / Expo Go
};

export type SubscriptionContextValue = SubscriptionState & {
  refresh: () => Promise<void>;
  purchase: (productKey: keyof typeof PRODUCTS) => Promise<void>;
  restore: () => Promise<void>;
  presentPaywall: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
  clearError: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================
function extractTier(active: Record<string, any>): Tier {
  if (active[ENTITLEMENT_FOUNDER]) return "founder";
  if (active[ENTITLEMENT_PRO]) return "pro";
  return "free";
}

function extractOfferings(current: any): SubscriptionState["offerings"] {
  if (!current) return {};
  const out: SubscriptionState["offerings"] = {};
  const pkgs: any[] = current.availablePackages || current.packages || [];
  for (const p of pkgs) {
    const product = p.product || p.storeProduct || {};
    const pid: string = product.identifier || "";
    const priceString: string =
      product.priceString || product.price_string || product.localized_price || product.priceFormatted || "";
    const title: string = product.title || product.localizedTitle || pid;
    const description: string = product.description || product.localizedDescription || "";
    const off: Offering = {
      identifier: p.identifier || pid,
      productId: pid as ProductId,
      priceString,
      title,
      description,
      rawPackage: p,
    };
    if (pid.includes("month")) out.monthly = off;
    else if (pid.includes("year") || pid.includes("annual")) out.yearly = off;
    else if (pid.includes("life") || pid.includes("founder")) out.lifetime = off;
  }
  return out;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    tier: "free",
    isPremium: false,
    isPro: false,
    isFounder: false,
    loading: true,
    busy: false,
    error: null,
    offerings: {},
    nativeAvailable: NATIVE_AVAILABLE,
  });

  // Configure RevenueCat once user is authenticated.
  useEffect(() => {
    if (!NATIVE_AVAILABLE || !PurchasesNative) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const apiKey =
          Platform.OS === "ios"
            ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
            : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
        if (!apiKey) {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error: "RevenueCat key missing" }));
          return;
        }
        await PurchasesNative.configure({ apiKey, appUserID: user?.user_id || null });
        if (user?.user_id) {
          try {
            await PurchasesNative.logIn(user.user_id);
          } catch (_e) {
            /* allow continuing as anonymous */
          }
        }
        const info = await PurchasesNative.getCustomerInfo();
        let offeringsCurrent: any = null;
        try {
          const o = await PurchasesNative.getOfferings();
          offeringsCurrent = o.current || null;
        } catch (_e) {
          /* offerings may not be configured yet */
        }
        const active = info?.entitlements?.active || {};
        const tier = extractTier(active);
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            tier,
            isPro: tier === "pro" || tier === "founder",
            isFounder: tier === "founder",
            isPremium: tier !== "free",
            offerings: extractOfferings(offeringsCurrent),
          }));
        }
        // Listen to updates
        try {
          PurchasesNative.addCustomerInfoUpdateListener?.((updated: any) => {
            const a = updated?.entitlements?.active || {};
            const t = extractTier(a);
            setState((s) => ({
              ...s,
              tier: t,
              isPro: t === "pro" || t === "founder",
              isFounder: t === "founder",
              isPremium: t !== "free",
            }));
          });
        } catch (_e) {
          /* listener optional */
        }
      } catch (e: any) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e?.message || "RC init failed" }));
      }
    })();
    return () => {
      cancelled = true;
    };
     
  }, [user?.user_id, token]);

  const refresh = useCallback(async () => {
    if (!NATIVE_AVAILABLE || !PurchasesNative) return;
    try {
      const info = await PurchasesNative.getCustomerInfo();
      const active = info?.entitlements?.active || {};
      const tier = extractTier(active);
      setState((s) => ({
        ...s,
        tier,
        isPro: tier === "pro" || tier === "founder",
        isFounder: tier === "founder",
        isPremium: tier !== "free",
      }));
    } catch (_e) {
      /* ignore */
    }
  }, []);

  const purchase = useCallback(async (productKey: keyof typeof PRODUCTS) => {
    if (!NATIVE_AVAILABLE || !PurchasesNative) {
      setState((s) => ({ ...s, error: "In-app purchases require a dev/production build (not Expo Go or web)." }));
      return;
    }
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const o = await PurchasesNative.getOfferings();
      const current = o.current;
      const offMap = extractOfferings(current);
      const off = offMap[productKey];
      if (!off || !off.rawPackage) throw new Error(`Product '${productKey}' not configured`);
      await PurchasesNative.purchasePackage(off.rawPackage);
      await refresh();
    } catch (e: any) {
      // User cancellation should not be shown as an error
      const msg = e?.message || "Purchase failed";
      const cancelled = e?.userCancelled || /cancel/i.test(msg);
      setState((s) => ({ ...s, busy: false, error: cancelled ? null : msg }));
      return;
    }
    setState((s) => ({ ...s, busy: false }));
  }, [refresh]);

  const restore = useCallback(async () => {
    if (!NATIVE_AVAILABLE || !PurchasesNative) {
      setState((s) => ({ ...s, error: "Restore Purchases requires a dev/production build." }));
      return;
    }
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const info = await PurchasesNative.restorePurchases();
      const active = info?.entitlements?.active || {};
      const tier = extractTier(active);
      setState((s) => ({
        ...s,
        busy: false,
        tier,
        isPro: tier === "pro" || tier === "founder",
        isFounder: tier === "founder",
        isPremium: tier !== "free",
      }));
    } catch (e: any) {
      setState((s) => ({ ...s, busy: false, error: e?.message || "Restore failed" }));
    }
  }, []);

  const presentPaywall = useCallback(async () => {
    if (!PurchasesUiNative?.presentPaywall) {
      setState((s) => ({ ...s, error: "Paywall UI requires a dev build with react-native-purchases-ui." }));
      return;
    }
    try {
      await PurchasesUiNative.presentPaywall({ onDismiss: () => refresh() });
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || "Could not present paywall" }));
    }
  }, [refresh]);

  const presentCustomerCenter = useCallback(async () => {
    if (!PurchasesUiNative?.presentCustomerCenter) {
      setState((s) => ({ ...s, error: "Customer Center requires a dev build with react-native-purchases-ui." }));
      return;
    }
    try {
      await PurchasesUiNative.presentCustomerCenter();
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || "Could not present customer center" }));
    }
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ...state,
      refresh,
      purchase,
      restore,
      presentPaywall,
      presentCustomerCenter,
      clearError,
    }),
    [state, refresh, purchase, restore, presentPaywall, presentCustomerCenter, clearError],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}

// Convenience hook for binary gating
export function usePremium(): { isPremium: boolean; isPro: boolean; isFounder: boolean; tier: Tier } {
  const { isPremium, isPro, isFounder, tier } = useSubscription();
  return { isPremium, isPro, isFounder, tier };
}
