// Centralized API client + helpers
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const USER_ID_KEY = "fishcast.user_id";
export const LOCATION_KEY = "fishcast.location";

export type SavedLocation = {
  lat: number;
  lon: number;
  display: string;
  source: "gps" | "manual";
};

export async function getOrCreateUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  // simple uuid v4-ish generator
  const id =
    "uxx-xxxx-xxxx-xxxx".replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16),
    ) + Date.now().toString(36);
  await AsyncStorage.setItem(USER_ID_KEY, id);
  return id;
}

export async function getSavedLocation(): Promise<SavedLocation | null> {
  const raw = await AsyncStorage.getItem(LOCATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedLocation;
  } catch {
    return null;
  }
}

export async function setSavedLocation(loc: SavedLocation): Promise<void> {
  await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
}

async function http<T>(
  path: string,
  init?: RequestInit & { params?: Record<string, any> },
): Promise<T> {
  let url = `${BASE_URL}/api${path}`;
  if (init?.params) {
    const qs = new URLSearchParams(
      Object.entries(init.params).reduce((acc, [k, v]) => {
        if (v !== undefined && v !== null) acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>),
    );
    url += `?${qs.toString()}`;
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ============== TYPES ==============
export type Contributor = { key: string; label: string; delta: number; note: string };
export type FishingScore = {
  score: number;
  verdict: "Excellent" | "Good" | "Fair" | "Poor";
  blurb: string;
  factors: Record<string, { score: number; note: string }>;
  contributors: Contributor[];
};

export type SafetyData = {
  level: "Safe" | "Use Caution" | "Dangerous";
  reasons: string[];
  headline: string;
};

export type ConfidenceData = {
  score: number;
  label: "High" | "Medium" | "Low";
  notes: string[];
  has_marine: boolean;
};

export type ForecastDay = {
  date: string;
  tmax_c: number;
  tmin_c: number;
  precip_mm: number;
  wind_max_kmh: number;
  pressure_hpa: number;
  weather_code: number;
  weather_text: string;
  sunrise?: string;
  sunset?: string;
  score: number;
  verdict: "Excellent" | "Good" | "Fair" | "Poor";
};

export type MoonData = {
  phase_name: string;
  illumination_pct: number;
  age_days: number;
  moonrise?: string | null;
  moonset?: string | null;
  transit?: string | null;
  antitransit?: string | null;
  solunar_score: number;
  major_windows: { label: string; start: string; end: string }[];
  minor_windows: { label: string; start: string; end: string }[];
};

export type TideData = {
  series: { t: string; h: number }[];
  extrema: { t: string; h: number; kind: "high" | "low" }[];
  current_height_m: number;
  movement_mph: number;
  direction: "incoming" | "outgoing";
};

export type SwellData = {
  current_swell_m: number;
  current_period_s: number | null;
  current_dir_deg: number | null;
  current_wave_m: number | null;
  series: { t: string; swell_h: number; swell_p: number | null; swell_d: number | null; wave_h: number | null }[];
};

export type BestWindow = { label: string; start: string; end: string };

export type Recommendation = {
  target_species: string;
  bait: string;
  depth: string;
  presentation: string;
};

export type ForecastResponse = {
  location: { lat: number; lon: number; timezone: string };
  current: {
    temperature_c: number;
    humidity_pct: number;
    precip_mm: number;
    cloud_pct: number;
    pressure_hpa: number;
    wind_kmh: number;
    wind_dir_deg: number;
    is_day: boolean;
    weather_code: number;
    weather_text: string;
  };
  scene: string;
  pressure_trend: { trend: "rising" | "falling" | "stable"; delta_hpa: number; label: string };
  pressure_history: number[];
  sunrise?: string;
  sunset?: string;
  moon: MoonData;
  tide: TideData | null;
  swell: SwellData | null;
  today_score: FishingScore;
  safety: SafetyData;
  confidence: ConfidenceData;
  best_window: BestWindow | null;
  days: ForecastDay[];
};

export type Species = {
  common_name: string;
  scientific_name: string;
  habitat: string;
  best_technique: string;
  best_time: string;
  activity_level: string;
};

export type Spot = {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lon: number;
  notes?: string;
  created_at: string;
};

export type Catch = {
  id: string;
  user_id: string;
  species: string;
  weight_lbs?: number;
  length_in?: number;
  location_name?: string;
  lat?: number;
  lon?: number;
  photo_base64?: string;
  notes?: string;
  conditions?: any;
  caught_at: string;
};

// ============== API METHODS ==============
export const api = {
  geocode: (query: string) => http<{ results: any[] }>("/geocode", { params: { query } }),
  reverseGeocode: (lat: number, lon: number) =>
    http<{ name: string | null; display: string }>("/reverse-geocode", { params: { lat, lon } }),
  forecast: (lat: number, lon: number) =>
    http<ForecastResponse>("/forecast", { params: { lat, lon } }),
  species: (lat: number, lon: number, location_name?: string) =>
    http<{ season: string; location: string; species: Species[] }>("/ai/species", {
      method: "POST",
      body: JSON.stringify({ lat, lon, location_name }),
    }),
  almanac: (body: {
    lat: number;
    lon: number;
    location_name?: string;
    score?: number;
    verdict?: string;
    pressure_trend?: string;
    wind_kmh?: number;
    temp_c?: number;
    weather?: string;
    moon_phase?: string;
    tide_direction?: string;
  }) =>
    http<{ almanac: string }>("/ai/almanac", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recommend: (body: {
    lat: number;
    lon: number;
    location_name?: string;
    score?: number;
    verdict?: string;
    pressure_trend?: string;
    wind_kmh?: number;
    temp_c?: number;
    weather?: string;
    moon_phase?: string;
    tide_direction?: string;
    is_coastal?: boolean;
  }) =>
    http<Recommendation>("/ai/recommend", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  whyHere: (body: any) => http<{ text: string }>("/ai/why-here", { method: "POST", body: JSON.stringify(body) }),
  whyNow: (body: any) => http<{ text: string }>("/ai/why-now", { method: "POST", body: JSON.stringify(body) }),
  regulations: (body: { lat: number; lon: number; location_name?: string }) =>
    http<{ summary: string }>("/ai/regulations", { method: "POST", body: JSON.stringify(body) }),
  hotspots: (lat: number, lon: number, radius_km = 8) =>
    http<{ spots: { id: string; name: string; kind: string; lat: number; lon: number; distance_km: number }[] }>(
      "/hotspots",
      { params: { lat, lon, radius_km } },
    ),
  listSpots: (user_id: string) => http<Spot[]>("/spots", { params: { user_id } }),
  createSpot: (body: { user_id: string; name: string; lat: number; lon: number; notes?: string }) =>
    http<Spot>("/spots", { method: "POST", body: JSON.stringify(body) }),
  deleteSpot: (id: string, user_id: string) =>
    http<{ deleted: boolean }>(`/spots/${id}`, { method: "DELETE", params: { user_id } }),
  listCatches: (user_id: string) => http<Catch[]>("/catches", { params: { user_id } }),
  createCatch: (body: Partial<Catch> & { user_id: string; species: string }) =>
    http<Catch>("/catches", { method: "POST", body: JSON.stringify(body) }),
  deleteCatch: (id: string, user_id: string) =>
    http<{ deleted: boolean }>(`/catches/${id}`, { method: "DELETE", params: { user_id } }),
};
