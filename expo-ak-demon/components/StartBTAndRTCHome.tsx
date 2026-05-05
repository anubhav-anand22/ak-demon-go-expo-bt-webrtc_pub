import { Color } from "@/constants/theme";
import { BTHandler } from "@/lib/BTHandler";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Button,
  Dimensions,
  StyleProp,
  TextStyle,
  FlatList,
  TouchableNativeFeedback,
} from "react-native";
import { Btn } from "./Btn";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { EdgeInsets, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebRTCHandler } from "@/lib/WebRTCHandler";
import { FlatListSpacer10 } from "./FlatListSpacer";
import Animated, {
  FadeInUp,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { setStringAsync as clipboardSetStringAsync } from "expo-clipboard";
import { Toast } from "toastify-react-native";

type StartBTHomeProps = {
  btConnectionState: BTConnectionState;
  isDataChannelReady: boolean;
  rtcEncStatus: RTCEncStatus;
  rtcStatus: RTCStatus;
  colors: Color;
};

let preventStartBTClick = false;

const StartBTHome = ({
  btConnectionState,
  colors,
  isDataChannelReady,
  rtcEncStatus,
  rtcStatus,
}: StartBTHomeProps) => {
  const logFlatListRef = useRef<FlatList<string>>(null);

  const bottomTabHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<string[]>([]);

  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const style = useMemo(
    () => getStyle(colors, bottomTabHeight, insets),
    [colors, bottomTabHeight, insets],
  );

  const addLogs = (log: string) => {
    setLogs((p) => [...p, log]);
  };

  useEffect(() => {
    const unSubBTHandler = BTHandler.getInstance().onLog((log) => {
      addLogs(log);
    });
    const unSubRTCHandler = WebRTCHandler.getInstance().onLog((log) => {
      addLogs(log);
    });

    return () => {
      unSubBTHandler();
      unSubRTCHandler();
    };
  }, []);

  useEffect(() => {
    logFlatListRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

  useEffect(() => {
    if (btConnectionState === "CONNECTED" && rtcStatus === "DISCONNECTED") {
      const WebRTCHandlerInstance = WebRTCHandler.getInstance();
      WebRTCHandlerInstance.init();
      setTimeout(() => {
        WebRTCHandlerInstance.startWebRTC();
      }, 100);
    }
  }, [btConnectionState, rtcStatus]);

  return (
    <View style={style.main}>
      <View style={style.statusCont}>
        <TextGridItem
          txt="Data Channel Status:"
          val={isDataChannelReady ? "READY" : "NOT_READY"}
          txtStyle={style.txt}
        />
        <TextGridItem txt="Bluetooth Status:" val={btConnectionState} txtStyle={style.txt} />
        <TextGridItem txt="WebRTC Enc Status:" val={rtcEncStatus} txtStyle={style.txt} />
        <TextGridItem txt="WebRTC Status:" val={rtcStatus} txtStyle={style.txt} />
      </View>
      <View style={style.logCont}>
        <Text style={{ ...style.txt, marginBottom: 10 }}>Logs: </Text>
        <Animated.FlatList
          ref={logFlatListRef}
          data={logs}
          keyExtractor={(e, i) => e + i}
          ItemSeparatorComponent={FlatListSpacer10}
          // inverted
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.duration(200)}>
              <TouchableNativeFeedback
                onPress={() => {
                  clipboardSetStringAsync(item);
                  Toast.info("Copied to clipboard");
                }}
              >
                <Text style={style.logTxt}>
                  {index + 1}
                  {") "}
                  {item}
                </Text>
              </TouchableNativeFeedback>
            </Animated.View>
          )}
        />
      </View>
      <Btn
        isFullWidth
        text={
          btConnectionState === "DISCONNECTED"
            ? "Start BT Advertisement"
            : btConnectionState === "CONNECTING"
              ? "Advertising..."
              : rtcStatus !== "CONNECTED"
                ? "Setting up WebRTC"
                : rtcEncStatus !== "SET"
                  ? "Setting Encrypting over RTC"
                  : "Processing..."
        }
        onPress={async () => {
          try {
            if (preventStartBTClick || btConnectionState !== "DISCONNECTED") return;
            preventStartBTClick = true;
            await BTHandler.getInstance().init();
          } catch (e) {
            console.log(e);
          } finally {
            preventStartBTClick = false;
          }
        }}
        disabled={btConnectionState !== "DISCONNECTED"}
      />
      {/* <Btn
        isFullWidth
        text={"Test"}
        onPress={async () => {
          addLogs("ok");
        }}
      /> */}
    </View>
  );
};

const getStyle = (colors: Color, bottomTabHeight: number, insets: EdgeInsets) => {
  const { height, width, fontScale } = Dimensions.get("window");
  return StyleSheet.create({
    txt: {
      color: colors.text,
      fontSize: 16 * fontScale,
    },
    logTxt: {
      color: colors.text,
      fontSize: 12 * fontScale,
    },
    logCont: {
      flex: 1,
      width: width - 20,
      backgroundColor: colors.item,
      color: colors.itemTxt,
      padding: 10,
      borderRadius: 10,
    },
    main: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: height - bottomTabHeight - insets.top,
      gap: 10,
      padding: 10,
    },
    btn: {
      flex: 1,
    },
    statusCont: {
      width,
      padding: 10,
    },
  });
};

export default StartBTHome;

type TextGridItemProps = {
  txt: string;
  val: string | number;
  txtStyle: StyleProp<TextStyle>;
};
const TextGridItem = ({ txt, val, txtStyle }: TextGridItemProps) => {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={txtStyle}>{txt}</Text>
      <Text style={txtStyle}>{val}</Text>
    </View>
  );
};
