// Units conversion + settings storage
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useCallback } from "react";

export type UnitSystem = "metric" | "imperial";

export const UNITS_KEY = "anglerj.units";

// ============ STORAGE ============
export async function getUnitSystem(): Promise<UnitSystem> {
  const v = await AsyncStorage.getItem(UNITS_KEY);
  return v === "imperial" ? "imperial" : "metric";
}

export async function setUnitSystem(u: UnitSystem): Promise<void> {
  await AsyncStorage.setItem(UNITS_KEY, u);
}

// Simple subscription hook — re-reads after writes via a tick counter
let __unitsTick = 0;
const __unitsListeners = new Set<() => void>();
export function notifyUnitsChanged() {
  __unitsTick++;
  __unitsListeners.forEach((l) => l());
}

export function useUnits(): { units: UnitSystem; setUnits: (u: UnitSystem) => Promise<void> } {
  const [units, setUnits] = useState<UnitSystem>("metric");

  const refresh = useCallback(async () => {
    setUnits(await getUnitSystem());
  }, []);

  useEffect(() => {
    refresh();
    const l = () => refresh();
    __unitsListeners.add(l);
    return () => {
      __unitsListeners.delete(l);
    };
  }, [refresh]);

  const set = useCallback(async (u: UnitSystem) => {
    await setUnitSystem(u);
    notifyUnitsChanged();
  }, []);

  return { units, setUnits: set };
}

// ============ CONVERSIONS ============
// Temperature
export const tempC = (c: number, u: UnitSystem) =>
  u === "imperial" ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
export const tempCRaw = (c: number, u: UnitSystem) =>
  u === "imperial" ? c * 9 / 5 + 32 : c;
export const tempUnit = (u: UnitSystem) => (u === "imperial" ? "°F" : "°C");

// Wind / Speed (input km/h)
export const speedKmh = (kmh: number, u: UnitSystem) =>
  u === "imperial" ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
export const speedUnit = (u: UnitSystem) => (u === "imperial" ? "mph" : "km/h");

// Pressure (input hPa)
export const pressureHpa = (hpa: number, u: UnitSystem) =>
  u === "imperial" ? `${(hpa * 0.02953).toFixed(2)} inHg` : `${Math.round(hpa)} hPa`;
export const pressureUnit = (u: UnitSystem) => (u === "imperial" ? "inHg" : "hPa");
export const pressureValue = (hpa: number, u: UnitSystem) =>
  u === "imperial" ? Number((hpa * 0.02953).toFixed(2)) : Math.round(hpa);

// Distance (m → ft)
export const distM = (m: number, u: UnitSystem) =>
  u === "imperial" ? `${Math.round(m * 3.28084)} ft` : `${m.toFixed(1)} m`;
export const distUnit = (u: UnitSystem) => (u === "imperial" ? "ft" : "m");

// Larger distances (km → mi). Input in km.
export const distKm = (km: number, u: UnitSystem) =>
  u === "imperial" ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`;

// Wave / Swell height (m)
export const heightM = (m: number, u: UnitSystem) => {
  if (u === "imperial") return `${(m * 3.28084).toFixed(1)} ft`;
  return `${m.toFixed(2)} m`;
};
export const heightUnit = (u: UnitSystem) => (u === "imperial" ? "ft" : "m");

// Weight (lbs in DB) - both systems
export const weight = (lbs: number, u: UnitSystem) => {
  if (u === "metric") {
    const kg = lbs * 0.453592;
    return `${kg.toFixed(2)} kg`;
  }
  return `${lbs.toFixed(2)} lb`;
};
export const weightUnit = (u: UnitSystem) => (u === "imperial" ? "lb" : "kg");
// Convert between input weight & stored lbs
export const weightToLbs = (value: number, u: UnitSystem) =>
  u === "metric" ? value / 0.453592 : value;
export const weightFromLbs = (lbs: number, u: UnitSystem) =>
  u === "metric" ? lbs * 0.453592 : lbs;

// Length (in in DB)
export const length = (inches: number, u: UnitSystem) => {
  if (u === "metric") return `${(inches * 2.54).toFixed(1)} cm`;
  return `${inches.toFixed(1)}"`;
};
export const lengthUnit = (u: UnitSystem) => (u === "imperial" ? "in" : "cm");
export const lengthToIn = (value: number, u: UnitSystem) =>
  u === "metric" ? value / 2.54 : value;
export const lengthFromIn = (inches: number, u: UnitSystem) =>
  u === "metric" ? inches * 2.54 : inches;
