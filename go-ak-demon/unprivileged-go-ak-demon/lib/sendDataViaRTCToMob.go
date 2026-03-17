
type RTCMsgToMobTest struct {
	Type string `json:"type"`
}

type RTCMsgToMobPing struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type RTCMsgToMobTimeUpdate struct {
	Type    string `json:"type"`
	Payload int    `json:"payload"`
}

import (
	"encoding/json"
	"log"

	"github.com/pion/webrtc/v3"
	"github.com/anubhav-anand22/ak-demon-golang-unprivileged/lib"
)

func SendRTCDataToMob(msg any, dc *webrtc.DataChannel) error {
	if dc == nil {
		return log.Printf("data channel is nil")
	}
	if dc.ReadyState() != webrtc.DataChannelStateOpen {
		return log.Printf("data channel is not open (current state: %s)", dc.ReadyState().String())
	}

	switch msg.(type) {
	case RTCMsgToMobTest, RTCMsgToMobPing, RTCMsgToMobTimeUpdate:
	default:
		return log.Printf("unsupported RTC message type: %T", msg)
	}

	jsonData, err := json.Marshal(msg)
	if err != nil {
		return log.Printf("failed to marshal RTC message: %w", err)
	}

	if err := dc.Send(jsonData); err != nil {
		return log.Printf("failed to send on data channel: %w", err)
	}

	log.Printf("Successfully sent %d bytes over WebRTC Data Channel", len(jsonData))
	return nil
}