import { BTHandler } from "./BTHandler";
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from "react-native-webrtc";
import { CryptoHandler } from "./CryptoHandler";
import { appLogger } from "./persistantLog";

export class WebRTCHandler {
  private static webRTCHandlerInstance: WebRTCHandler;

  public crypto = CryptoHandler.getInstance();

  private readonly CHUNK_SIZE = 10240;
  private chunkBuffer = new Map<string, Uint8Array[]>();

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private rtcStatus: RTCStatus = "DISCONNECTED";
  private rtcEncStatus: RTCEncStatus = "NOT_SET";

  private isWebRTCInitRunning = false;
  private dataChannelEventCallbackList = new Map<string, (isAvailable: boolean) => void>();
  private rtcStatusEventCallbackList = new Map<string, (status: RTCStatus) => void>();
  private rtcDataParseErrEventCallbackList = new Map<string, (err: any) => void>();
  private onLogEventCallbackList = new Map<string, (...msg: string[]) => void>();
  private rtcEncEventCallbackList = new Map<string, (status: RTCEncStatus) => void>();
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

  private log(...msg: string[]) {
    this.onLogEventCallbackList.forEach((cb) => cb(...msg));
    console.log(...msg);
    appLogger.info(...msg);
  }
  private errLog(...msg: string[]) {
    this.onLogEventCallbackList.forEach((cb) => cb(...msg));
    console.log(...msg);
    appLogger.error(...msg);
  }

  private setRTCStatus(status: RTCStatus) {
    this.rtcStatus = status;
    this.rtcStatusEventCallbackList.forEach((cb) => cb(status));
    if (status !== "CONNECTED") {
      this.setRTCEncStatus("NOT_SET");
    }
    this.log(`Setting RTC status: ${status}`);
  }
  private setRTCEncStatus(status: RTCEncStatus) {
    this.rtcEncStatus = status;
    this.rtcEncEventCallbackList.forEach((cb) => cb(status));
    this.log(`Setting RTC Enc status: ${status}`);
  }

  public sendMsg(msg: RTCMsgObj_SEND) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.log("Sending msg via RTC");
      this.dataChannel.send(JSON.stringify(msg));
    } else {
      this.log("Msg can not be sent, data channel is not open.");
    }
  }

  public async sendLargeMsg(msg: RTCMsgObj_SEND, onProgress?: (percent: number) => void) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.log("Cannot send large message, channel not open.");
      return;
    }

    try {
      const jsonString = JSON.stringify(msg);
      // Convert to Base64 so we don't have to worry about broken UTF-8 multi-byte characters when slicing!
      const rawBytes = Buffer.from(jsonString, "utf-8");

      const totalChunks = Math.ceil(rawBytes.length / this.CHUNK_SIZE);
      const messageId = Math.random().toString(36).substring(2, 9); // Unique ID for this transmission

      this.log(`Starting large transmission: ${rawBytes.length} bytes over ${totalChunks} chunks.`);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, rawBytes.length);
        const chunk = rawBytes.subarray(start, end);

        const { nonce, ciphertext } = this.crypto.encryptBytes(new Uint8Array(chunk));

        // The Envelope
        const envelope: RTCMsgObj_SEND = {
          type: "CHUNKED_PAYLOAD",
          id: messageId,
          total: totalChunks,
          index: i,
          nonce: nonce, // Send the unique nonce
          data: ciphertext,
        };

        // this.dataChannel.send(JSON.stringify(envelope));
        this.sendMsg(envelope);

        if (onProgress) {
          onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        // Tiny delay every 10 chunks to let the native WebRTC SCTP buffer flush
        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      this.log(`Transmission complete of large message! ID: ${messageId}`);
    } catch (e) {
      this.errLog("Failed to send large message");
      console.log("Failed to send large message:", e);
    }
  }

  public async startWebRTC() {
    try {
      this.log("Connecting WebRTC");
      this.setRTCStatus("CONNECTING");

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      }) as any;

      this.pc = pc;

      // 1. Create a Data Channel for testing P2P communication
      const dataChannel = pc.createDataChannel("chat") as RTCDataChannel;
      this.log("Created new data channel");
      this.dataChannel = dataChannel;

      dataChannel.onopen = () => {
        this.setRTCStatus("CONNECTED");
        this.dataChannelEventCallbackList.forEach((cb) => cb(true));
        this.log("WebRTC DataChannel Opened!");
        this.sendMsg({ type: "PING", payload: "Ping from React Native WebRTC!" });
      };

      dataChannel.onmessage = (event: MessageEvent) => {
        try {
          const rawData = event.data;
          let data: RTCMsgObj_RECEIVE;
          try {
            data = JSON.parse(rawData) as RTCMsgObj_RECEIVE;
          } catch (e) {
            console.log(e);
            return;
          }

          // --- NEW: Intercept and Reassemble Chunked Payloads ---
          if (data.type === "CHUNKED_PAYLOAD") {
            const { id, total, index, nonce, data: ciphertext } = data;

            // 1. Decrypt the incoming chunk
            const decryptedBytes = this.crypto.decryptBytes(nonce, ciphertext);

            // 2. Initialize the array if this is the first chunk for this ID
            if (!this.chunkBuffer.has(id)) {
              this.chunkBuffer.set(id, new Array(total));
            }

            // 3. Slot the decrypted bytes into the correct index
            const buffer = this.chunkBuffer.get(id)!;
            buffer[index] = decryptedBytes;

            // 4. Check if we have received all chunks
            let isComplete = true;
            for (let i = 0; i < total; i++) {
              if (!buffer[i]) {
                isComplete = false;
                break;
              }
            }

            if (isComplete) {
              console.log(`All ${total} chunks received for ID ${id}. Reassembling...`);

              // Calculate total length and concatenate all Uint8Arrays
              const totalLength = buffer.reduce((acc, val) => acc + val.length, 0);
              const fullBytes = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of buffer) {
                fullBytes.set(chunk, offset);
                offset += chunk.length;
              }

              // Free memory immediately
              this.chunkBuffer.delete(id);

              // Convert bytes back to string and parse the full JSON!
              const jsonString = Buffer.from(fullBytes).toString("utf-8");
              const parsedMsg = JSON.parse(jsonString) as Partial<RTCMsgObj_RECEIVE>;

              // Trigger the UI callbacks with the fully assembled message
              this.rtcDataEventCallbackList.forEach((cb) => cb(parsedMsg));
            }
            return; // Exit early so it doesn't trigger the standard message logic
          } else if (data.type === "PEER_PUB_KEY") {
            this.log("Got peer pub key");
            this.crypto.setPeerPublicKey(data.key);
            this.sendMsg({ type: "PEER_PUB_KEY", key: this.crypto.getMyPublicKeyBase64() });
            this.setRTCEncStatus("SETTING");
          } else if (data.type === "PEER_PUB_KEY_SET_SUCCESS") {
            this.log("Got peer pub key set success msg");
            this.setRTCEncStatus("SET");
          }
          // -----------------------------------------------------

          // Standard single-shot message handling
          console.log("WebRTC Message from Go:", data);
          this.rtcDataEventCallbackList.forEach((cb) => cb(data as Partial<RTCMsgObj_RECEIVE>));
        } catch (e) {
          console.error("WebRTC Parse/Decrypt Error:", e);
          this.errLog("WebRTC Parse/Decrypt Error");
          this.rtcDataParseErrEventCallbackList.forEach((cb) => cb(e));
        }
      };

      dataChannel.onclose = () => {
        this.dataChannelEventCallbackList.forEach((cb) => cb(false));
        this.log("Data channel has closed");
      };

      dataChannel.onerror = (e) => {
        this.dataChannelEventCallbackList.forEach((cb) => cb(false));
        console.log(e);
        this.errLog("Data channel error occurred");
      };

      // 2. Send ICE candidates to Go via BLE
      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          BTHandler.getInstance().sendData({
            type: "WEBRTC_ICE",
            payload: event.candidate.toJSON(),
          });
          this.log("Got WebRTC ICE");
        }
      };

      pc.onconnectionstatechange = () => {
        this.log("WebRTC State:", pc.connectionState);
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

      this.log("Sending WebRTC Offer via BLE...");
      BTHandler.getInstance().sendData({
        type: "WEBRTC_OFFER",
        payload: offer,
      });
    } catch (e) {
      console.log(e);
      this.setRTCStatus("DISCONNECTED");
      this.errLog("Error occurred while starting WebRTC");
    }
  }

  public async init() {
    if (this.isWebRTCInitRunning) return;
    this.isWebRTCInitRunning = true;
    this.log("Initiating WebRTC");

    let unSubWebRtc: () => void = () => {};

    try {
      unSubWebRtc = BTHandler.getInstance().onMsg(async (msg) => {
        if (!this.pc) return;

        try {
          if (msg.type === "WEBRTC_ANSWER" && msg.payload) {
            this.log("Received Answer from Go via BLE!");
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          } else if (msg.type === "WEBRTC_ICE" && msg.payload) {
            this.log("Received ICE Candidate from Go via BLE");
            await this.pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          }
        } catch (err) {
          console.error("WebRTC Signaling Error:", err);
          this.errLog("WebRTC Signaling Error");
        }
      });
    } catch (e) {
      console.log(e);
      this.isWebRTCInitRunning = false;
      unSubWebRtc();
      this.errLog("Error while initializing WebRTC");
    }

    return () => {
      unSubWebRtc();
      this.isWebRTCInitRunning = false;
    };
  }

  public getRTCStatus() {
    return this.rtcStatus;
  }

  public getDataChannel() {
    return this.dataChannel;
  }

  public getRTCEncStatus() {
    return this.rtcEncStatus;
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
  public onRTCEncStatusChange(cb: (status: RTCEncStatus) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.rtcEncEventCallbackList.set(id, cb);
    return () => {
      this.rtcEncEventCallbackList.delete(id);
    };
  }
  public onLog(cb: (...msg: string[]) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.onLogEventCallbackList.set(id, cb);

    return () => {
      this.onLogEventCallbackList.delete(id);
    };
  }
}
