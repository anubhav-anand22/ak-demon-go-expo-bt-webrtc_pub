import { useEffect, useMemo, useState } from "react";
import { WebRTCHandler } from "../lib/WebRTCHandler";

export const useWebRTCConnection = () => {
  const handler = useMemo(() => WebRTCHandler.getInstance(), []);

  const [rtcStatus, setRtcStatus] = useState<RTCStatus>(handler.getRTCStatus());
  const [isDataChannelReady, setIsDataChannelReady] = useState<boolean>(false);
  const [rtcEncStatus, setRTCEncStatus] = useState<RTCEncStatus>(handler.getRTCEncStatus());

  useEffect(() => {
    let unSubInit: (() => void) | undefined;
    handler.init().then((unsub) => {
      unSubInit = unsub;
    });

    const unSubRtc = handler.onRTCStatusChange((status) => {
      setRtcStatus(status);
    });

    const unSubDataChannel = handler.onDataChannelStatusChange((isAvailable) => {
      setIsDataChannelReady(isAvailable);
    });

    const unSubRTCEncChange = handler.onRTCEncStatusChange((status) => {
      setRTCEncStatus(status);
    });

    return () => {
      unSubRtc();
      unSubDataChannel();
      unSubRTCEncChange();
      if (unSubInit) unSubInit();
    };
  }, []);

  return {
    rtcStatus,
    rtcEncStatus,
    isDataChannelReady,
    startWebRTC: () => handler.startWebRTC(),
    dataChannel: handler.getDataChannel(),
    sendRTCData: (msg: RTCMsgObj_SEND) => handler.sendMsg(msg),
  };
};
