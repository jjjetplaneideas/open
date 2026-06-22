/**
 * Animated live outdoor conditions scene.
 * Switches between: clear, partly_cloudy, overcast, rain, heavy_rain, storm, fog,
 * night_clear, night_cloudy. Always overlays wind streaks (scaled by wind) and
 * water chop at the bottom (scaled by wind+swell).
 */
import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { COLORS } from "@/src/theme";

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = {
  scene: string;
  windKmh: number;
  swellM?: number | null;
  height?: number;
};

const SKY: Record<string, [string, string]> = {
  clear: ["#F2C273", "#D8742E"],          // golden hour
  partly_cloudy: ["#E9D3A3", "#B69A6E"],
  overcast: ["#A8A29A", "#6E6C66"],
  rain: ["#84867F", "#4F5251"],
  heavy_rain: ["#5F6261", "#36393A"],
  storm: ["#3E4044", "#1F2123"],
  fog: ["#D6D2C9", "#A5A19A"],
  night_clear: ["#1B2942", "#091324"],
  night_cloudy: ["#2A2D33", "#0F1112"],
};

export default function LiveConditions({ scene, windKmh, swellM = 0, height = 220 }: Props) {
  const { width } = useWindowDimensions();
  const colors = SKY[scene] || SKY.partly_cloudy;
  const isNight = scene.startsWith("night");
  const isFoggy = scene === "fog";
  const isRain = scene === "rain" || scene === "heavy_rain" || scene === "storm";
  const isStorm = scene === "storm";
  const showSun = scene === "clear" || scene === "partly_cloudy";

  // ============ Animations ============
  // Slowly drift clouds
  const cloud1 = useSharedValue(-80);
  const cloud2 = useSharedValue(40);
  useEffect(() => {
    cloud1.value = withRepeat(
      withTiming(width + 80, { duration: 40000, easing: Easing.linear }),
      -1, false,
    );
    cloud2.value = withRepeat(
      withTiming(width + 200, { duration: 60000, easing: Easing.linear }),
      -1, false,
    );
  }, [cloud1, cloud2, width]);

  const cloud1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud1.value }],
  }));
  const cloud2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud2.value }],
  }));

  // Water chop (sine-wave-ish ripple via two shifted layers)
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  useEffect(() => {
    const choppySpeed = Math.max(1500, 5000 - windKmh * 80 - (swellM || 0) * 800);
    wave1.value = withRepeat(
      withTiming(20, { duration: choppySpeed, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
    wave2.value = withRepeat(
      withTiming(-15, { duration: choppySpeed * 1.3, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
  }, [wave1, wave2, windKmh, swellM]);

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave1.value }],
  }));
  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave2.value }],
  }));

  // Lightning flicker for storms
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!isStorm) return;
    const cycle = () => {
      flash.value = withTiming(1, { duration: 80 }, () => {
        flash.value = withTiming(0, { duration: 80 }, () => {
          flash.value = withDelay(
            3500 + Math.random() * 4000,
            withTiming(0, { duration: 0 }),
          );
        });
      });
    };
    const id: any = setInterval(cycle, 6000);
    return () => clearInterval(id);
  }, [isStorm, flash]);
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value * 0.7,
  }));

  // Sun shimmer
  const sun = useSharedValue(0);
  useEffect(() => {
    sun.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
      -1, true,
    );
  }, [sun]);
  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + sun.value * 0.08 }],
    opacity: 0.92 + sun.value * 0.08,
  }));

  // Wind streaks
  const windStreaks = useMemo(() => {
    const n = Math.min(7, Math.max(2, Math.round(windKmh / 5)));
    return new Array(n).fill(0).map((_, i) => ({
      key: i,
      top: 30 + i * (height / (n + 1)),
      delay: i * 240,
    }));
  }, [windKmh, height]);

  // Rain drops — only render when raining
  const rainDrops = useMemo(() => {
    if (!isRain) return [];
    const n = scene === "heavy_rain" || isStorm ? 26 : 14;
    return new Array(n).fill(0).map((_, i) => ({
      key: i,
      x: Math.random() * width,
      delay: Math.random() * 1500,
      speed: 600 + Math.random() * 600,
    }));
  }, [isRain, isStorm, scene, width]);

  // Stars at night
  const stars = useMemo(() => {
    if (scene !== "night_clear") return [];
    return new Array(18).fill(0).map((_, i) => ({
      key: i,
      x: Math.random() * width,
      y: Math.random() * (height * 0.55),
      r: 1 + Math.random() * 1.5,
    }));
  }, [scene, width, height]);

  const waveColor = isNight ? "rgba(86, 110, 130, 0.55)" : "rgba(46, 66, 52, 0.55)";

  return (
    <View testID={`live-conditions-${scene}`} style={[styles.container, { height }]}>
      {/* Sky gradient */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors[0]} stopOpacity="1" />
            <Stop offset="1" stopColor={colors[1]} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={`M0 0 H${width} V${height} H0 Z`} fill="url(#sky)" />

        {/* Stars */}
        {stars.map((s) => (
          <Circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill="#F3E3B6" opacity={0.85} />
        ))}
      </Svg>

      {/* Sun / Moon */}
      {showSun && (
        <AnimatedView style={[styles.sunWrap, sunStyle]}>
          <Svg width={120} height={120}>
            <Defs>
              <LinearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFF1B0" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFC36B" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Circle cx={60} cy={60} r={36} fill="url(#sunGrad)" />
            <Circle cx={60} cy={60} r={50} fill="#FFE08A" opacity={0.18} />
          </Svg>
        </AnimatedView>
      )}
      {isNight && (
        <View style={styles.sunWrap}>
          <Svg width={100} height={100}>
            <Circle cx={50} cy={50} r={26} fill="#F3E3B6" />
            <Circle cx={58} cy={44} r={26} fill={colors[0]} />
          </Svg>
        </View>
      )}

      {/* Clouds */}
      {(scene === "partly_cloudy" || scene === "overcast" || scene === "night_cloudy"
        || isRain || isFoggy) && (
        <>
          <AnimatedView style={[styles.cloud, { top: 40 }, cloud1Style]}>
            <CloudSvg w={140} h={60} color={isNight ? "#3B3F44" : "#FFFFFF"} opacity={isFoggy ? 0.55 : 0.85} />
          </AnimatedView>
          <AnimatedView style={[styles.cloud, { top: 80 }, cloud2Style]}>
            <CloudSvg w={180} h={70} color={isNight ? "#2B2E33" : "#FFFFFF"} opacity={isFoggy ? 0.45 : 0.7} />
          </AnimatedView>
          {scene === "overcast" || scene === "heavy_rain" || isStorm ? (
            <AnimatedView style={[styles.cloud, { top: 20 }, cloud1Style]}>
              <CloudSvg w={220} h={80} color="#5B5E63" opacity={0.85} />
            </AnimatedView>
          ) : null}
        </>
      )}

      {/* Fog overlay */}
      {isFoggy && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(214,210,201,0.45)" }]} />
      )}

      {/* Wind streaks */}
      {windKmh > 8 &&
        windStreaks.map((s) => (
          <WindStreak key={s.key} top={s.top} delay={s.delay} width={width} windKmh={windKmh} />
        ))}

      {/* Rain */}
      {rainDrops.map((d) => (
        <RainDrop key={d.key} x={d.x} delay={d.delay} duration={d.speed} height={height - 40} />
      ))}

      {/* Lightning flash */}
      {isStorm && (
        <AnimatedView
          style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }, flashStyle]}
        />
      )}

      {/* Water at the bottom */}
      <View style={[styles.water, { height: 60 }]}>
        <AnimatedView style={[styles.waveRow, wave1Style]}>
          <Svg height={60} width={width * 1.4}>
            <Path
              d={waveD(width * 1.4, 60, 8 + (swellM || 0) * 6 + windKmh * 0.25)}
              fill={waveColor}
            />
          </Svg>
        </AnimatedView>
        <AnimatedView style={[styles.waveRow, { bottom: -8 }, wave2Style]}>
          <Svg height={60} width={width * 1.4}>
            <Path
              d={waveD(width * 1.4, 60, 6 + (swellM || 0) * 4 + windKmh * 0.2, 0.7)}
              fill={isNight ? "rgba(60, 78, 96, 0.7)" : "rgba(66, 94, 74, 0.75)"}
            />
          </Svg>
        </AnimatedView>
      </View>
    </View>
  );
}

function waveD(w: number, h: number, amp: number, phase: number = 0): string {
  const segments = 8;
  const segW = w / segments;
  let d = `M 0 ${h / 2}`;
  for (let i = 0; i < segments; i++) {
    const cx1 = i * segW + segW / 4;
    const cx2 = i * segW + (segW * 3) / 4;
    const sign = (i + (phase ? 1 : 0)) % 2 === 0 ? -1 : 1;
    const y1 = h / 2 + sign * amp;
    const y2 = h / 2 - sign * amp;
    d += ` C ${cx1} ${y1}, ${cx2} ${y2}, ${(i + 1) * segW} ${h / 2}`;
  }
  d += ` L ${w} ${h} L 0 ${h} Z`;
  return d;
}

function CloudSvg({ w, h, color, opacity = 0.85 }: { w: number; h: number; color: string; opacity?: number }) {
  return (
    <Svg width={w} height={h}>
      <Path
        d={`M ${w * 0.18} ${h * 0.7} Q ${w * 0.05} ${h * 0.7}, ${w * 0.1} ${h * 0.45}
            Q ${w * 0.05} ${h * 0.2}, ${w * 0.3} ${h * 0.2}
            Q ${w * 0.42} ${h * 0.0}, ${w * 0.6} ${h * 0.15}
            Q ${w * 0.82} ${h * 0.08}, ${w * 0.88} ${h * 0.35}
            Q ${w * 0.98} ${h * 0.55}, ${w * 0.82} ${h * 0.7} Z`}
        fill={color}
        opacity={opacity}
      />
    </Svg>
  );
}

function WindStreak({
  top, delay, width, windKmh,
}: { top: number; delay: number; width: number; windKmh: number }) {
  const x = useSharedValue(-100);
  const speed = Math.max(1800, 6000 - windKmh * 80);
  useEffect(() => {
    x.value = withDelay(
      delay,
      withRepeat(
        withTiming(width + 100, { duration: speed, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [x, delay, speed, width]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <AnimatedView style={[styles.windStreak, { top }, style]}>
      <View
        style={{
          width: 60 + windKmh,
          height: 1.5,
          backgroundColor: "rgba(255,255,255,0.55)",
          borderRadius: 1,
        }}
      />
    </AnimatedView>
  );
}

function RainDrop({
  x, delay, duration, height,
}: { x: number; delay: number; duration: number; height: number }) {
  const y = useSharedValue(-30);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withTiming(height + 20, { duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [y, delay, duration, height]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <AnimatedView
      style={[
        {
          position: "absolute",
          left: x,
          width: 1.5,
          height: 14,
          backgroundColor: "rgba(200, 220, 240, 0.7)",
          borderRadius: 1,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: COLORS.surfaceInverse },
  sunWrap: { position: "absolute", top: 12, right: 24 },
  cloud: { position: "absolute", left: 0 },
  windStreak: { position: "absolute", left: 0 },
  water: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  waveRow: { position: "absolute", left: -40, right: 0, bottom: 0 },
});
