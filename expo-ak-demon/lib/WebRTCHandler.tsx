import { BTHandler } from "./BTHandler";
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from "react-native-webrtc";

export class WebRTCHandler {
  private static webRTCHandlerInstance: WebRTCHandler;

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private rtcStatus: RTCStatus = "DISCONNECTED";

  private dataChannelEventCallbackList = new Map<string, (isAvailable: boolean) => void>();
  private rtcStatusEventCallbackList = new Map<string, (status: RTCStatus) => void>();
  private rtcDataParseErrEventCallbackList = new Map<string, (err: any) => void>();
  private rtcDataEventCallbackList = new Map<
    string,
    (data: Partial<RTCMsgObj_RECEIVE> | null) => void
  >();

  private constructor() {}

  public static getInstance() {
    if (!WebRTCHandler.webRTCHandlerInstance) {
      WebRTCHandler.webRTCHandlerInstance = new WebRTCHandler();
    }
    return WebRTCHandler.webRTCHandlerInstance;
  }

  private setRTCStatus(status: RTCStatus) {
    this.rtcStatus = status;
    this.rtcStatusEventCallbackList.forEach((cb) => cb(status));
  }

  public sendMsg(msg: RTCMsgObj_SEND) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(JSON.stringify(msg));
    } else {
      console.log(
        "Msg can not be send, data channel is not open or does not exists",
        !!this.dataChannel,
        this.dataChannel?.readyState,
      );
    }
  }

  public async startWebRTC() {
    try {
      this.setRTCStatus("CONNECTING");

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      }) as any;

      this.pc = pc;

      // 1. Create a Data Channel for testing P2P communication
      const dataChannel = pc.createDataChannel("chat") as RTCDataChannel;
      this.dataChannel = dataChannel;

      dataChannel.onopen = () => {
        this.setRTCStatus("CONNECTED");
        this.dataChannelEventCallbackList.forEach((cb) => cb(true));
        console.log("WebRTC DataChannel Opened!");
        this.sendMsg({ type: "PING", payload: "Ping from React Native WebRTC!" });
      };

      dataChannel.onmessage = (event: MessageEvent) => {
        try {
          console.log("WebRTC Message from Go:", event.data);
          const rawData = event.data;
          const data = JSON.parse(rawData) as Partial<RTCMsgObj_RECEIVE>;
          this.rtcDataEventCallbackList.forEach((cb) => cb(data));
        } catch (e) {
          console.log(e);
          this.rtcDataParseErrEventCallbackList.forEach((cb) => cb(e));
        }
      };

      dataChannel.onclose = () => {
        this.dataChannelEventCallbackList.forEach((cb) => cb(false));
      };

      dataChannel.onerror = (e) => {
        this.dataChannelEventCallbackList.forEach((cb) => cb(false));
        console.log(e);
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
          this.setRTCStatus("DISCONNECTED");
          this.dataChannelEventCallbackList.forEach((cb) => cb(false));
          pc.close();
          this.pc = null;
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
    } catch (e) {
      console.log(e);
      this.setRTCStatus("DISCONNECTED");
    }
  }

  public async init() {
    const unSubWebRtc = BTHandler.getInstance().onMsg(async (msg) => {
      if (!this.pc) return;

      try {
        if (msg.type === "WEBRTC_ANSWER" && msg.payload) {
          console.log("Received Answer from Go via BLE!");
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } else if (msg.type === "WEBRTC_ICE" && msg.payload) {
          console.log("Received ICE Candidate from Go via BLE");
          await this.pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      } catch (err) {
        console.error("WebRTC Signaling Error:", err);
      }
    });

    return () => {
      unSubWebRtc();
    };
  }

  public getRTCStatus() {
    return this.rtcStatus;
  }

  public getDataChannel() {
    return this.dataChannel;
  }

  public onRTCStatusChange(cb: (status: RTCStatus) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.rtcStatusEventCallbackList.set(id, cb);
    cb(this.rtcStatus);
    return () => {
      this.rtcStatusEventCallbackList.delete(id);
    };
  }

  public onDataChannelStatusChange(cb: (isAvailable: boolean) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.dataChannelEventCallbackList.set(id, cb);
    cb(this.dataChannel?.readyState === "open");
    return () => {
      this.dataChannelEventCallbackList.delete(id);
    };
  }
  public onRTCData(cb: (data: Partial<RTCMsgObj_RECEIVE> | null) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.rtcDataEventCallbackList.set(id, cb);
    return () => {
      this.rtcDataEventCallbackList.delete(id);
    };
  }
  public onRTCDataParseErr(cb: (err: any) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.rtcDataParseErrEventCallbackList.set(id, cb);
    return () => {
      this.rtcDataParseErrEventCallbackList.delete(id);
    };
  }
}
