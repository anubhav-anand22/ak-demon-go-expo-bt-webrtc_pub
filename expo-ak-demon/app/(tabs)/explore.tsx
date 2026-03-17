import { useBTConnection } from "@/hooks/useBTConnection";
import { BTHandler } from "@/lib/BTHandler";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, View, Text } from "react-native";
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from "react-native-webrtc";

const ExploreScreen = () => {
  const isBTConnected = useBTConnection();
  const [rtcStatus, setRtcStatus] = useState("Disconnected");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<any>(null);

  const startWebRTC = useCallback(async () => {
    setRtcStatus("Connecting...");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    }) as any;

    pcRef.current = pc;

    // 1. Create a Data Channel for testing P2P communication
    const dataChannel = pc.createDataChannel("chat");
    dcRef.current = dataChannel;

    dataChannel.onopen = () => {
      setRtcStatus("Connected!");
      console.log("WebRTC DataChannel Opened!");
      dataChannel.send("Ping from React Native WebRTC!");
    };

    dataChannel.onmessage = (event: any) => {
      console.log("WebRTC Message from Go:", event.data);
    };

    // 2. Send ICE candidates to Go via BLE
    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        BTHandler.getInstance().sendData({
          type: "WEBRTC_ICE",
          payload: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC State:", pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setRtcStatus("Disconnected");
        pc.close();
      }
    };

    // 3. Create Offer and send via BLE
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    console.log("Sending WebRTC Offer via BLE...");
    BTHandler.getInstance().sendData({
      type: "WEBRTC_OFFER",
      payload: offer,
    });
  }, []);

  useEffect(() => {
    const btHandler = BTHandler.getInstance();

    btHandler.init();

    const unSub = btHandler.onMsg((msg) => {
      console.log("MSG to mob from go via bt", { msg });
    });

    const unSubWebRtc = BTHandler.getInstance().onMsg(async (msg) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (msg.type === "WEBRTC_ANSWER" && msg.payload) {
          console.log("Received Answer from Go via BLE!");
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } else if (msg.type === "WEBRTC_ICE" && msg.payload) {
          console.log("Received ICE Candidate from Go via BLE");
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      } catch (err) {
        console.error("WebRTC Signaling Error:", err);
      }
    });

    return () => {
      unSub();
      unSubWebRtc();
    };
  }, [startWebRTC]);

  return (
    <View style={{ paddingTop: 50 }}>
      <Text>{isBTConnected ? "BT is connected" : "BT is NOT connected"}</Text>
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
    </View>
  );
};

export default ExploreScreen;
