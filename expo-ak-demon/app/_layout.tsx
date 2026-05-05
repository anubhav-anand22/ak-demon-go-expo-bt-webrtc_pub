import "react-native-get-random-values";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useEffect } from "react";
import { BTHandler } from "@/lib/BTHandler";
import { useBTConnection } from "@/hooks/useBTConnection";
import { View } from "react-native";
import ToastManager from "toastify-react-native";
import { PersistentLoggerWrapper } from "@/lib/persistantLog";
import { BatteryOptWrapper } from "@/components/BatteryOptWrapper";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const btHandler = BTHandler.getInstance();

    return () => {
      btHandler.getManager().destroy();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <PersistentLoggerWrapper>
        <BatteryOptWrapper>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
          </Stack>
        </BatteryOptWrapper>
      </PersistentLoggerWrapper>
      <StatusBar style="auto" />
      <ToastManager />
    </ThemeProvider>
  );
}
