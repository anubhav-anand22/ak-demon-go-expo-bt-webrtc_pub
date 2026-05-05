import { useBTConnection } from "@/hooks/useBTConnection";
import { useWebRTCConnection } from "@/hooks/useWebRTCConnection";
import { BTHandler } from "@/lib/BTHandler";
import { appLogger, getAllLogFiles, getAllLogs } from "@/lib/persistantLog";
import { useEffect } from "react";
import { Button, View, Text } from "react-native";

const ExploreScreen = () => {
  // const isBTConnected = useBTConnection();
  // const { isDataChannelReady, rtcStatus, sendRTCData, startWebRTC } = useWebRTCConnection();

  // useEffect(() => {
  //   const btHandler = BTHandler.getInstance();

  //   btHandler.init();

  //   const unSub = btHandler.onMsg((msg) => {
  //     console.log("MSG to mob from go via bt", { msg });
  //   });

  //   return () => {
  //     unSub();
  //   };
  // }, []);

  return (
    <View style={{ paddingTop: 50, gap: 20 }}>
      <Text>Hello</Text>
      <Button
        title="TEST"
        onPress={async () => {
          const logFiles = await getAllLogFiles();
          logFiles.forEach((logFile) => getAllLogs(logFile));
        }}
      />
      <Button
        title="OK"
        onPress={async () => {
          appLogger.info("OK");
        }}
      />
      {/* <Text>{isBTConnected ? "BT is connected" : "BT is NOT connected"}</Text>
      <Text>{isDataChannelReady ? "Data channel is ready" : "Data channel is NOT ready"}</Text>
      <Text>RTC_STATUS: {rtcStatus}</Text>
      <Button
        title="Send msg"
        onPress={() => {
          if (!isBTConnected) return console.log("BT is not connected");
          BTHandler.getInstance().sendData({ type: "TEST" });
        }}
      />
      <Button
        title="Start webRTC"
        onPress={() => {
          if (!isBTConnected) return console.log("BT is not connected");
          startWebRTC();
        }}
      />
      <Button
        title="Send msg via webRTC"
        onPress={() => {
          if (!isDataChannelReady) return console.log("WebRTC channel is ot ready");
          sendRTCData({ type: "PING", payload: "Ping from expo app via rtc channel" });
        }}
      /> */}
    </View>
  );
};

export default ExploreScreen;
