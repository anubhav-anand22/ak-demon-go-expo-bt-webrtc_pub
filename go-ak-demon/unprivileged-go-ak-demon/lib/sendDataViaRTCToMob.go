package lib

// import (
// 	"encoding/json"
// 	"log"

// 	"github.com/pion/webrtc/v3"
// )

// type RTCMsgToMobTest struct {
// 	Type string `json:"type"`
// }

// type RTCMsgToMobPing struct {
// 	Type    string `json:"type"`
// 	Payload string `json:"payload"`
// }

// type RTCMsgToMobTimeUpdate struct {
// 	Type    string `json:"type"`
// 	Payload int    `json:"payload"`
// }

// func SendRTCDataToMob(msg any, dc *webrtc.DataChannel) {
// 	if dc == nil {
// 		log.Printf("data channel is nil")
// 		return
// 	}
// 	if dc.ReadyState() != webrtc.DataChannelStateOpen {
// 		log.Printf("data channel is not open (current state: %s)", dc.ReadyState().String())
// 		return
// 	}

// 	switch msg.(type) {
// 	case RTCMsgToMobTest, RTCMsgToMobPing, RTCMsgToMobTimeUpdate:
// 	default:
// 		log.Printf("unsupported RTC message type: %T", msg)
// 		return
// 	}

// 	jsonData, err := json.Marshal(msg)
// 	if err != nil {
// 		log.Printf("failed to marshal RTC message: %w", err)
// 		return
// 	}

// 	if err := dc.Send(jsonData); err != nil {
// 		log.Printf("failed to send on data channel: %w", err)
// 		return
// 	}

// 	log.Printf("Successfully sent %d bytes over WebRTC Data Channel", len(jsonData))

// }
