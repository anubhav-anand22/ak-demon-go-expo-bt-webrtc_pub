import { useEffect, useState } from "react";
import { WebRTCHandler } from "../lib/WebRTCHandler";

const handler = WebRTCHandler.getInstance();

export const useWebRTCConnection = () => {
  const [rtcStatus, setRtcStatus] = useState<RTCStatus>(handler.getRTCStatus());
  const [isDataChannelReady, setIsDataChannelReady] = useState<boolean>(false);

  useEffect(() => {
    const unSubRtc = handler.onRTCStatusChange((status) => {
      setRtcStatus(status);
    });

    const unSubDataChannel = handler.onDataChannelStatusChange((isAvailable) => {
      setIsDataChannelReady(isAvailable);
    });

    return () => {
      unSubRtc();
      unSubDataChannel();
    };
  }, []);

  return {
    rtcStatus,
    isDataChannelReady,
    startWebRTC: () => handler.startWebRTC(),
    dataChannel: handler.getDataChannel(),
    sendRTCData: (msg: RTCMsgObj_SEND) => handler.sendMsg(msg),
  };
};
