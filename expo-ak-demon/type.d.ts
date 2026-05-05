type BtEncMsgToPri = {
  type: "BT_PUB_KEY_EXCHANGE_FROM_MOB";
  payload: string;
};

type BtEncMsgFromPri = {
  type: "BT_PUB_KEY_EXCHANGE_FROM_PRI";
  payload: string;
};

type BTMsgTo =
  | {
      type: "TEST" | "REQ_TO_START_WEB_RTC_FROM_MOB";
    }
  | {
      type: "WEBRTC_OFFER" | "WEBRTC_ICE";
      payload: any;
    }
  | BtEncMsgToPri;

type BTMsgFrom =
  | {
      type: "SEND_TEST_MSG_TO_MOB_BT";
    }
  | {
      type: "WEBRTC_ANSWER" | "WEBRTC_ICE";
      payload: any;
    }
  | BtEncMsgFromPri;

type RTCStatus = "CONNECTING" | "DISCONNECTED" | "CONNECTED";
type RTCEncStatus = "SETTING" | "NOT_SET" | "SET";

type RTCMsgObj_SEND =
  | {
      type: "TEST";
    }
  | {
      type: "TIME_UPDATE";
      payload: number;
    }
  | {
      type: "PING";
      payload: string;
    }
  | {
      type: "CHUNKED_PAYLOAD";
      id: string;
      total: number;
      index: number;
      nonce: string;
      data: string;
    }
  | {
      type: "PEER_PUB_KEY";
      key: string;
    };

type RTCMsgObj_RECEIVE =
  | {
      type: "TEST";
    }
  | {
      type: "TIME_UPDATE";
      payload: number;
    }
  | {
      type: "PING";
      payload: string;
    }
  | {
      type: "CHUNKED_PAYLOAD";
      id: string;
      total: number;
      index: number;
      nonce: string;
      data: string;
    }
  | {
      type: "PEER_PUB_KEY";
      key: string;
    }
  | {
      type: "PEER_PUB_KEY_SET_SUCCESS";
    };

type BTConnectionState = "CONNECTED" | "DISCONNECTED" | "CONNECTING";
