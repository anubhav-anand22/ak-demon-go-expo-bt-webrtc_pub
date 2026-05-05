import { Colors } from "@/constants/theme";
import { useColorScheme } from "react-native";
import { useEffect, useState } from "react";

export const useTheme = () => {
  const theme = useColorScheme();

  const [colors, setColors] = useState(Colors[theme || "dark"]);

  useEffect(() => {
    setColors(Colors[theme || "dark"]);
  }, [theme]);

  return { colors, theme };
};
