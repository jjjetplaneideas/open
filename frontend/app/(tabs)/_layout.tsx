import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surfaceSecondary,
          borderTopColor: COLORS.divider,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync();
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sunny-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="forecast"
        options={{
          title: "Forecast",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fish"
        options={{
          title: "Fish",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="fish-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: "Log",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
