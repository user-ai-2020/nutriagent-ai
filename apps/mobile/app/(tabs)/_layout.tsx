import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import {
  AnalysisIcon,
  ChatIcon,
  DashboardIcon,
  FoodsIcon,
  NutrientsIcon,
  SettingsIcon,
} from "@/components/Icons";
import { colors, fonts } from "@/theme/tokens";

const SCREEN_KEYS = [
  { name: "chat", titleKey: "nav.chat", tabKey: "nav.chatShort", Icon: ChatIcon },
  { name: "dashboard", titleKey: "nav.dashboard", tabKey: "nav.dashboardShort", Icon: DashboardIcon },
  { name: "summary", titleKey: "nav.summary", tabKey: "nav.summaryShort", Icon: FoodsIcon },
  { name: "meal-analysis", titleKey: "nav.mealAnalysis", tabKey: "nav.mealAnalysisShort", Icon: AnalysisIcon },
  { name: "nutrients", titleKey: "nav.nutrients", tabKey: "nav.nutrientsShort", Icon: NutrientsIcon },
  { name: "settings", titleKey: "nav.settings", tabKey: "nav.settingsShort", Icon: SettingsIcon },
] as const;

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const isDesktop = width >= 768;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.text,
        tabBarActiveBackgroundColor: isDesktop ? colors.accent100 : undefined,
        headerStyle: { backgroundColor: colors.surface, borderBottomColor: colors.divider },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.heading, fontWeight: "600", fontSize: 17 },
        sceneStyle: { backgroundColor: colors.bg, marginLeft: isDesktop ? 220 : 0 },
        tabBarStyle: isDesktop
          ? {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 220,
              height: "100%" as unknown as number,
              flexDirection: "column",
              paddingTop: 72,
              paddingHorizontal: 10,
              borderTopWidth: 0,
              borderRightWidth: 1,
              borderRightColor: colors.divider,
              backgroundColor: colors.surface,
            }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.divider,
            },
        tabBarItemStyle: isDesktop
          ? { width: 200, justifyContent: "flex-start", paddingLeft: 12, borderRadius: 12, marginBottom: 2 }
          : { paddingVertical: 6 },
        tabBarLabelStyle: isDesktop
          ? { fontFamily: fonts.body, fontSize: 14, marginLeft: 10 }
          : { fontFamily: fonts.body, fontSize: 9.5 },
      }}
    >
      {SCREEN_KEYS.map(({ name, titleKey, tabKey, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(titleKey),
            tabBarLabel: isDesktop ? t(titleKey) : t(tabKey),
            tabBarIcon: ({ color }) => <Icon size={isDesktop ? 19 : 18} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
