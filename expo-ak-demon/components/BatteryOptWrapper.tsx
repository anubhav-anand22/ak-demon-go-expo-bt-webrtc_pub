import { useTheme } from "@/hooks/useTheme";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { Btn } from "./Btn";
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from "expo-ignore-battery-optimizations";

export const BatteryOptWrapper = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();

  const [isOptOff, setIsOptOff] = useState(false);
  const [isTurningOfOpt, setIsTurningOfOpt] = useState(false);
  const isTurningOfOptRef = useRef(false);

  const init = useCallback(async () => {
    try {
      if (isTurningOfOptRef.current) return;
      isTurningOfOptRef.current = true;
      setIsTurningOfOpt(true);
      const isIgnoring = isIgnoringBatteryOptimizations();
      console.log({ isIgnoring });
      if (!isIgnoring) {
        await requestIgnoreBatteryOptimizations();
      }
      setIsOptOff(true);
    } catch (e) {
      console.log(e);
      setIsOptOff(false);
    } finally {
      isTurningOfOptRef.current = false;
      setIsTurningOfOpt(false);
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  if (isOptOff) {
    return <>{children}</>;
  } else {
    return (
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ backgroundColor: colors.item, padding: 20, borderRadius: 10, gap: 10 }}>
          <Text style={{ color: colors.itemTxt }}>Disable Battery Optimization</Text>
          <ActivityIndicator size={"large"} />
          <Btn text={isTurningOfOpt ? "Disabling..." : "Disable"} onPress={init} />
        </View>
      </View>
    );
  }
};
