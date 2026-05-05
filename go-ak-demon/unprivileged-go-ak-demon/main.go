package main

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"path/filepath"
	"time"

	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"

	"os"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"

	"github.com/anubhav-anand22/ak-demon-golang-unprivileged/lib"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	privConn net.Conn
	mu       sync.Mutex

	activeWebSockets []*websocket.Conn
	wsMutex          sync.Mutex
	dataChannel      *webrtc.DataChannel
	dataChannelMutex sync.Mutex

	chunkBuffer      = make(map[string][][]byte)
	chunkBufferMutex sync.Mutex
	cryptoHandler    *lib.CryptoHandler
)

var peerConnection *webrtc.PeerConnection

func main() {
	homeDir, _ := os.UserHomeDir()
	logFilePath := filepath.Join(homeDir, ".ak-demon", "unprivileged", "unprivileged_app.log")
	f, _ := os.Create(logFilePath)

	gin.DefaultWriter = io.MultiWriter(f, os.Stdout)
	log.SetOutput(io.MultiWriter(f, os.Stdout))
	log.SetPrefix("[UNPRIVILEGED] ")

	log.Printf("Staring...")

	log.Printf("UID: %d, GID: %d", os.Getuid(), os.Getgid())
	log.Printf("Resolved HomeDir: %s", homeDir)
	log.Printf("Target File Path: %s", filepath.Join(homeDir, ".ak-demon", "unprivileged", "pub", "front", "index.html"))

	var err error
	privConn, err = net.Dial("unix", "/var/run/ble_bridge.sock")
	if err != nil {
		log.Printf("Failed to connect to privileged socket: %v", err)
	}
	defer privConn.Close()

	go listenToPrivileged()

	r := gin.Default()

	r.GET("/ws", func(c *gin.Context) {
		handleWebSocket(c.Writer, c.Request)
	})

	r.GET("/ok", func(ctx *gin.Context) {
		ctx.JSON(200, gin.H{
			"ok": "ok",
		})
	})

	isDev := false

	if len(os.Args) > 1 {
		if os.Args[1] == "dev" {
			isDev = true
		}
	}

	if isDev {
		log.Println("Setting up dev server")
		target, err := url.Parse("http://localhost:3000")

		r.NoRoute(func(ctx *gin.Context) {
			if err != nil {
				ctx.String(http.StatusInternalServerError, "Failed to parse target URL")
				return
			}

			proxy := httputil.NewSingleHostReverseProxy(target)
			proxy.ServeHTTP(ctx.Writer, ctx.Request)
		})
	} else {
		pubDirPath := filepath.Join(homeDir, ".ak-demon", "unprivileged", "pub")
		log.Printf("UID: %d, GID: %d", os.Getuid(), os.Getgid())
		log.Printf("Resolved HomeDir: %s", homeDir)
		log.Printf("Target File Path: %s", filepath.Join(homeDir, ".ak-demon", "unprivileged", "pub", "front", "index.html"))

		r.Static("/pub", pubDirPath)

		r.NoRoute(func(ctx *gin.Context) {

			ctx.File(filepath.Join(pubDirPath, "front", "index.html"))

		})
	}

	log.Println("Unprivileged Server starting on :8080")
	r.Run(":8080")
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}

	wsMutex.Lock()
	activeWebSockets = append(activeWebSockets, ws)
	wsMutex.Unlock()

	defer func() {

		wsMutex.Lock()
		for i, v := range activeWebSockets {
			if v == ws {
				activeWebSockets = append(activeWebSockets[:i], activeWebSockets[i+1:]...)
				break
			}
		}
		wsMutex.Unlock()
		ws.Close()
	}()

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			break
		}

		msg, err, defaulted := lib.ParseFrontendMsgJson(message)

		if defaulted {
			log.Printf("Error: No msg type found %s", message)
			continue
		}

		switch m := msg.(type) {
		case lib.TestTypeMsg:
			log.Printf("Test msg from frontend via websocket %s", m.Type)
		case lib.TestMstToPriTypeMsg:
			log.Printf("Test msg from frontend to privileged app %s", m.Type)
			SendToPrivileged(message)
		case lib.TestMstToMobBtTypeMsg:
			log.Printf("Test msg from frontend to mob via BT %s", m.Type)
			SendToPrivileged(message)

		}
	}
}

func SendToPrivileged(jsonData []byte) error {
	mu.Lock()
	defer mu.Unlock()

	privConn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	payload := append(jsonData, '\n')

	_, err := privConn.Write(payload)
	if err != nil {
		log.Printf("Failed to write to privileged app: %v", err)
		return err
	}
	return nil
}

func listenToPrivileged() {

	privConn.SetReadDeadline(time.Time{})

	scanner := bufio.NewScanner(privConn)

	log.Println("Listening for incoming messages from Privileged App...")

	for scanner.Scan() {
		rawMsg := scanner.Bytes()
		log.Printf("🔥 Received from Privileged App: %s", string(rawMsg))

		msg, err, didDefaulted := lib.ParsePriMsgJson(rawMsg)

		if didDefaulted {
			log.Printf("Msg Defaulted from pri to unpri app")
			continue
		}

		if err != nil {
			log.Printf("Err when parsing msg from pri to unpri app")
			log.Print(err)
			continue
		}

		switch v := msg.(type) {
		case lib.BasePriMsgTestType:
			log.Printf("Test msg from pri to unpri via unix socket")
		case lib.MobReqToStartWebRTC:
			log.Printf("Req to start webrtc from mob to unpri")
		case lib.WebRTCOfferFromMob:
			log.Printf("WebRTC offer from mob")
			log.Printf("%s", v.Type)
			handleWebRTCOffer(v.Payload)
		case lib.WebRTCICEFromMob:
			log.Printf("WebRTC ICE from mob")
			handleWebRTCICE(v.Payload)
		default:
			log.Printf("DEFAULTED No case match")
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Error reading from privileged socket: %v", err)
	}
	log.Println("Privileged socket connection closed.")
}

func handleWebRTCOffer(payload json.RawMessage) {
	var err error = nil
	cryptoHandler, err = lib.NewCryptoHandler()

	var offer webrtc.SessionDescription
	if err := json.Unmarshal(payload, &offer); err != nil {
		log.Printf("Failed to parse offer: %v", err)
		return
	}

	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}, {
			URLs:       []string{"turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443"},
			Username:   "openrelayproject",
			Credential: "openrelayproject",
		}},
	}

	if peerConnection != nil {
		peerConnection.Close()
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Printf("Failed to create PeerConnection: %v", err)
	}
	peerConnection = pc

	pc.OnDataChannel(func(d *webrtc.DataChannel) {
		log.Printf("New DataChannel: %s", d.Label())
		dataChannelMutex.Lock()
		dataChannel = d
		dataChannelMutex.Unlock()
		d.OnMessage(func(msg webrtc.DataChannelMessage) {
			log.Printf("Message from Mobile via WebRTC: '%s'", string(msg.Data))
			parsedMsg, err, didDefaulted := lib.ParseRTCMsgReceived(msg.Data)

			if didDefaulted {
				log.Printf("RTC message defaulted")
				return
			}

			if err != nil {
				log.Print(err)
				return
			}

			log.Print(parsedMsg)

			switch v := parsedMsg.(type) {
			case lib.ChunkedPayloadMsg:
				decryptedChunk, err := cryptoHandler.DecryptBytes(v.Nonce, v.Data)
				if err != nil {
					log.Printf("Failed to decrypt secure chunk %d: %v", v.Index, err)
					return
				}

				chunkBufferMutex.Lock()

				if _, exists := chunkBuffer[v.ID]; !exists {
					// Initialize the 2D byte array to hold 'Total' number of chunks
					chunkBuffer[v.ID] = make([][]byte, v.Total)
				}

				chunkBuffer[v.ID][v.Index] = decryptedChunk

				isComplete := true
				for _, c := range chunkBuffer[v.ID] {
					if c == nil {
						isComplete = false
						break
					}
				}

				if isComplete {
					log.Printf("All %d chunks received for ID %s. Reassembling...", v.Total, v.ID)

					var fullBytes []byte
					for _, c := range chunkBuffer[v.ID] {
						fullBytes = append(fullBytes, c...)
					}

					delete(chunkBuffer, v.ID)
					chunkBufferMutex.Unlock()

					finalMsg, finalErr, finalDef := lib.ParseRTCMsgReceived(fullBytes)
					if finalErr == nil && !finalDef {
						handleCompleteRTCMessage(finalMsg)
					} else {
						log.Printf("Reassembled JSON parse error: %v", finalErr)
					}

				} else {
					chunkBufferMutex.Unlock()
				}

			default:
				handleCompleteRTCMessage(parsedMsg)

			}

		})
		d.OnClose(func() {
			dataChannelMutex.Lock()
			dataChannel = nil
			dataChannelMutex.Unlock()
		})
		d.OnError(func(err error) {
			dataChannelMutex.Lock()
			dataChannel = nil
			dataChannelMutex.Unlock()
		})
		d.OnOpen(func() {
			log.Printf("Got data channel sending pub key")
			pubKeyMsg := lib.PeerPubKeyMsg{
				Type: "PEER_PUB_KEY",
				Key:  cryptoHandler.GetMyPublicKeyBase64(),
			}
			SendSmallMsgToMobUnEnc(pubKeyMsg, d)
		})
	})

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil {
			candidateJSON, _ := json.Marshal(c.ToJSON())
			reply := []byte(`{"type": "WEBRTC_ICE", "payload": ` + string(candidateJSON) + `}`)
			SendToPrivileged(reply)
		}
	})

	if err := pc.SetRemoteDescription(offer); err != nil {
		log.Printf("Failed to set remote description: %v", err)
	} else {
		log.Printf("Set remote description via received offer")
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		log.Printf("Failed to create answer: %v", err)
	}

	if err := pc.SetLocalDescription(answer); err != nil {
		log.Printf("Failed to set local description: %v", err)
	} else {
		log.Printf("Successfully set local description using answer generated")
	}

	answerJSON, _ := json.Marshal(answer)
	reply := []byte(`{"type": "WEBRTC_ANSWER", "payload": ` + string(answerJSON) + `}`)
	SendToPrivileged(reply)

	log.Println("Sent WebRTC Answer via BLE")
}

func handleCompleteRTCMessage(parsedMsg any) {
	switch v := parsedMsg.(type) {
	case lib.BaseRTCTestMsgType:
		log.Print("TEST msg via rtc")
	case lib.PingRTCMsgType:
		log.Printf("PING msg via rtc, val: %s", v.Payload)
	case lib.TimeUpdateRTCMsgType:
		log.Printf("Time update msg via rtc, time: %d", v.Payload)
	case lib.PeerPubKeyMsg:
		cryptoHandler.SetPeerPublicKey(v.Key)
		pubKeyMsg := lib.BaseRTCMsgType{
			Type: "PEER_PUB_KEY_SET_SUCCESS",
		}
		SendSmallMsgToMobUnEnc(pubKeyMsg, dataChannel)
	default:
		log.Printf("Received complete message of unknown type: %T", v)
	}
}

func handleWebRTCICE(payload json.RawMessage) {
	if peerConnection == nil {
		return
	}
	var candidate webrtc.ICECandidateInit
	if err := json.Unmarshal(payload, &candidate); err != nil {
		log.Printf("Failed to parse ICE candidate: %v", err)
		return
	}
	if err := peerConnection.AddICECandidate(candidate); err != nil {
		log.Printf("Failed to add ICE candidate: %v", err)
	} else {
		log.Printf("Successfully added ICE candidate")
	}
}

func SendSmallMsgToMobUnEnc(msg any, dc *webrtc.DataChannel) error {
	if dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen {
		return fmt.Errorf("cannot send small message, channel not open")
	}
	jsonBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal msg: %w", err)
	}
	if err := dc.SendText(string(jsonBytes)); err != nil {
		return fmt.Errorf("failed to send small msg %w", err)
	}
	return nil
}

func SendLargeMsgToMob(msg any, dc *webrtc.DataChannel) error {
	if dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen {
		return fmt.Errorf("cannot send large message, channel not open")
	}
	if cryptoHandler == nil || !cryptoHandler.IsReady() { // Assuming you add an IsReady() check to your Go handler!
		return fmt.Errorf("E2E Encryption not ready")
	}

	jsonBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal msg: %w", err)
	}

	const CHUNK_SIZE = 10240 // 10 KB to stay safely under WebRTC limits
	totalChunks := (len(jsonBytes) + CHUNK_SIZE - 1) / CHUNK_SIZE

	// Generate a random ID for this transmission envelope
	randNum, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	messageId := fmt.Sprintf("go-%d", randNum)

	log.Printf("Starting secure transmission to Mobile: %d bytes over %d chunks.", len(jsonBytes), totalChunks)

	for i := 0; i < totalChunks; i++ {
		start := i * CHUNK_SIZE
		end := start + CHUNK_SIZE
		if end > len(jsonBytes) {
			end = len(jsonBytes)
		}

		// 1. Slice the raw bytes
		chunkBytes := jsonBytes[start:end]

		// 2. Encrypt the chunk
		encData, err := cryptoHandler.EncryptBytes(chunkBytes)
		if err != nil {
			return fmt.Errorf("encryption failed on chunk %d: %w", i, err)
		}

		// 3. Create the envelope
		envelope := lib.ChunkedPayloadMsg{
			Type:  "CHUNKED_PAYLOAD",
			ID:    messageId,
			Total: totalChunks,
			Index: i,
			Nonce: encData.Nonce,
			Data:  encData.Ciphertext,
		}

		envBytes, _ := json.Marshal(envelope)

		// 4. Send via WebRTC
		if err := dc.SendText(string(envBytes)); err != nil {
			return fmt.Errorf("failed to send chunk %d: %w", i, err)
		}

		// 5. Prevent WebRTC SCTP buffer overflow
		if i%10 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
	}

	log.Printf("Secure transmission complete! ID: %s", messageId)
	return nil
}
