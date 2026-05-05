package lib

import (
	"encoding/json"
	"fmt"
)

type BaseRTCMsgType struct {
	Type string `json:"type"`
}
type BaseRTCTestMsgType struct {
	Type string `json:"type"`
}

type PingRTCMsgType struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type TimeUpdateRTCMsgType struct {
	Type    string `json:"type"`
	Payload int    `json:"payload"`
}

type ChunkedPayloadMsg struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	Total int    `json:"total"`
	Index int    `json:"index"`
	Nonce string `json:"nonce"`
	Data  string `json:"data"`
}

type PeerPubKeyMsg struct {
	Type string `json:"type"`
	Key  string `json:"key"`
}

func ParseRTCMsgReceived(jsonData []byte) (msg any, err error, defaulted bool) {
	var base BaseRTCMsgType
	if err := json.Unmarshal(jsonData, &base); err != nil {
		return nil, fmt.Errorf("could not peek at json type: %w", err), false
	}

	switch base.Type {
	case "TEST":
		var target BaseRTCTestMsgType
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	case "PING":
		var target PingRTCMsgType
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false

	case "TIME_UPDATE":
		var target TimeUpdateRTCMsgType
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	case "CHUNKED_PAYLOAD":
		var target ChunkedPayloadMsg
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	case "PEER_PUB_KEY":
		var target PeerPubKeyMsg
		if err := json.Unmarshal(jsonData, &target); err != nil {
			return nil, err, false
		}
		return target, nil, false
	default:
		return nil, fmt.Errorf("unknown type: %s", base.Type), true
	}
}
