import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";

import { HelloWave } from "@/components/hello-wave";
import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Link } from "expo-router";
import { useBTConnection } from "@/hooks/useBTConnection";
import { useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { Color } from "@/constants/theme";
import StartBTAndRTCHome from "@/components/StartBTAndRTCHome";
import { useWebRTCConnection } from "@/hooks/useWebRTCConnection";
import {} from "expo-device";

export default function HomeScreen() {
  const btConnectionState = useBTConnection();
  const { isDataChannelReady, rtcEncStatus, rtcStatus } = useWebRTCConnection();
  const { colors } = useTheme();

  const style = useMemo(() => getStyle(colors), [colors]);

  useEffect(() => {
    console.log({ btConnectionState, isDataChannelReady, rtcEncStatus, rtcStatus });
  }, [btConnectionState, isDataChannelReady, rtcEncStatus, rtcStatus]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {btConnectionState !== "CONNECTED" ||
      !isDataChannelReady ||
      rtcEncStatus !== "SET" ||
      rtcStatus !== "CONNECTED" ? (
        <StartBTAndRTCHome
          btConnectionState={btConnectionState}
          colors={colors}
          isDataChannelReady={isDataChannelReady}
          rtcEncStatus={rtcEncStatus}
          rtcStatus={rtcStatus}
        />
      ) : (
        <>
          <View>
            <Text style={style.txt}>Ok</Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const getStyle = (colors: Color) => {
  return StyleSheet.create({
    txt: {
      color: colors.text,
    },
  });
};

/*
<ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
*/
