package main

import (
	"encoding/json"
	"fmt"
)

type BaseBTMsgType struct {
	Type string `json:"type"`
}

type BTTestTypeMsg struct {
	Type string `json:"type"`
}

type MobReqToStartWebRTC struct {
	Type string `json:"type"`
}

type WebRTCOfferFromMob struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}
type WebRTCICEFromMob struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func ParseBTMsgFromMob(jsonData []byte) (msg any, err error, defaulted bool) {
	var base BaseBTMsgType
	if err := json.Unmarshal(jsonData, &base); err != nil {
		return nil, fmt.Errorf("could not peek at json type: %w", err), false
	}

	switch base.Type {
	case "TEST":
		var target BTTestTypeMsg
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	case "REQ_TO_START_WEB_RTC_FROM_MOB":
		var target MobReqToStartWebRTC
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false

	case "WEBRTC_OFFER":
		var target WebRTCOfferFromMob
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	case "WEBRTC_ICE":
		var target WebRTCICEFromMob
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false

	default:
		return nil, fmt.Errorf("unknown type: %s", base.Type), true
	}
}
