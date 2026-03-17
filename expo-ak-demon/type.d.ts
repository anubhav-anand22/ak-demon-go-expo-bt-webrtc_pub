type BTMsgTo =
  | {
      type: "TEST" | "REQ_TO_START_WEB_RTC_FROM_MOB";
    }
  | {
      type: "WEBRTC_OFFER" | "WEBRTC_ICE";
      payload: any;
    };

type BTMsgFrom =
  | {
      type: "SEND_TEST_MSG_TO_MOB_BT";
    }
  | {
      type: "WEBRTC_ANSWER" | "WEBRTC_ICE";
      payload: any;
    };

type RTCStatus = "CONNECTING" | "DISCONNECTED" | "CONNECTED";

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
    };
