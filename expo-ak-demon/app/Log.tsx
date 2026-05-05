import { onAppLogger } from "@/lib/persistantLog";
import { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import Animated from "react-native-reanimated";

const LogScreen = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);

  const addLog = (log: string) => setLogs((p) => [...p, log]);

  const init = async () => {
    try {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);
    } catch (e) {
      console.log(e);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unSubAppLogger = onAppLogger(addLog);
    init();
    return () => {
      unSubAppLogger();
    };
  }, []);
  return (
    <View>
      {isLoading ? (
        <View>
          <Text>Loading...</Text>
        </View>
      ) : (
        <View>
          <Animated.FlatList
            data={logs}
            renderItem={({ item }) => (
              <Animated.View>{/* TODO: create log screen */}</Animated.View>
            )}
          />
        </View>
      )}
    </View>
  );
};

export default LogScreen;
