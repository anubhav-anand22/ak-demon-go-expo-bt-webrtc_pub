package main

import (
	"bufio"
	"encoding/json"
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
	// Upgrader for WebSockets
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true }, // Relax for development
	}
	// Connection to the privileged socket
	privConn net.Conn
	mu       sync.Mutex

	activeWebSockets []*websocket.Conn
	wsMutex          sync.Mutex
	dataChannel      *webrtc.DataChannel
	dataChannelMutex sync.Mutex
)

var peerConnection *webrtc.PeerConnection

func main() {
	homeDir, _ := os.UserHomeDir()
	logFilePath := filepath.Join(homeDir, ".ak-demon", "unprivileged", "unprivileged_app.log")
	f, _ := os.Create(logFilePath)

	// Set Gin to log to both the file and standard output
	gin.DefaultWriter = io.MultiWriter(f, os.Stdout)
	log.SetOutput(io.MultiWriter(f, os.Stdout))
	log.SetPrefix("[UNPRIVILEGED] ")
	// log.Println("Worker started and connected to Unix socket")

	log.Printf("Staring...")

	log.Printf("UID: %d, GID: %d", os.Getuid(), os.Getgid())
	log.Printf("Resolved HomeDir: %s", homeDir)
	log.Printf("Target File Path: %s", filepath.Join(homeDir, ".ak-demon", "unprivileged", "pub", "front", "index.html"))

	// 1. Connect to the Privileged socket first
	var err error
	privConn, err = net.Dial("unix", "/var/run/ble_bridge.sock")
	if err != nil {
		log.Printf("Failed to connect to privileged socket: %v", err)
	}
	defer privConn.Close()

	go listenToPrivileged()

	// 2. Setup Gin
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
			// ctx.File("./pub/front/index.html")
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
		// Clean up the connection when the client disconnects
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

	// Listen for messages from SolidJS
	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			break
		}

		msg, err, defaulted := lib.ParseFrontendMsgJson(message)

		// log.Printf("%s", string(message))
		// ws.WriteMessage(websocket.TextMessage, []byte("hello"))

		if defaulted {
			log.Printf("Error: No msg type found %s", message)
			continue
		}

		switch m := msg.(type) {
		case lib.TestTypeMsg:
			log.Printf("Test msg from frontend via websocket %s", m.Type)
		case lib.TestMstToPriTypeMsg:
			log.Printf("Test msg from frontend to privileged app %s", m.Type)
			mu.Lock()
			privConn.SetDeadline(time.Now().Add(5 * time.Second))
			privConn.Write(append(message, '\n'))
			resp, _ := bufio.NewReader(privConn).ReadString('\n')
			mu.Unlock()
			ws.WriteMessage(websocket.TextMessage, []byte(resp))
		case lib.TestMstToMobBtTypeMsg:
			log.Printf("Test msg from frontend to mob via BT %s", m.Type)
			mu.Lock()
			privConn.SetDeadline(time.Now().Add(5 * time.Second))
			privConn.Write(append(message, '\n'))
			resp, _ := bufio.NewReader(privConn).ReadString('\n')
			mu.Unlock()
			ws.WriteMessage(websocket.TextMessage, []byte(resp))
		}
	}
}

func SendToPrivileged(jsonData []byte) error {
	mu.Lock()
	defer mu.Unlock()

	// Ensure there are no lingering deadlines that would block the write
	privConn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	// Ensure the payload has exactly one newline at the end
	payload := append(jsonData, '\n')

	_, err := privConn.Write(payload)
	if err != nil {
		log.Printf("Failed to write to privileged app: %v", err)
		return err
	}
	return nil
}

func listenToPrivileged() {
	// Remove read deadlines so the scanner can block infinitely waiting for BLE data
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
	var offer webrtc.SessionDescription
	if err := json.Unmarshal(payload, &offer); err != nil {
		log.Printf("Failed to parse offer: %v", err)
		return
	}

	// 2. Setup Pion WebRTC configuration
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}

	// Close existing connection if renegotiating
	if peerConnection != nil {
		peerConnection.Close()
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Printf("Failed to create PeerConnection: %v", err)
	}
	peerConnection = pc

	// 3. Setup a DataChannel so we can test the connection!
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
			case lib.BaseRTCTestMsgType:
				log.Print("TEST msg via rtc")
			case lib.PingRTCMsgType:
				log.Printf("PING msg via rtc, val: %s", v.Payload)
			case lib.TimeUpdateRTCMsgType:
				log.Printf("Time update msg via rtc, time: %d", v.Payload)
			}
			// d.SendText("Hello from Go WebRTC!") // Echo back
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
	})

	// 4. Send our ICE Candidates back to React Native via BLE as they are gathered
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil {
			candidateJSON, _ := json.Marshal(c.ToJSON())
			reply := []byte(`{"type": "WEBRTC_ICE", "payload": ` + string(candidateJSON) + `}`)
			SendToPrivileged(reply) // Sends to Unix Socket -> Privileged -> BLE TX
		}
	})

	// 5. Apply the Offer
	if err := pc.SetRemoteDescription(offer); err != nil {
		log.Printf("Failed to set remote description: %v", err)
	} else {
		log.Printf("Set remote description via received offer")
	}

	// 6. Create the Answer
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		log.Printf("Failed to create answer: %v", err)
	}

	// 7. Apply our Answer locally
	if err := pc.SetLocalDescription(answer); err != nil {
		log.Printf("Failed to set local description: %v", err)
	} else {
		log.Printf("Successfully set local description using answer generated")
	}

	// 8. Send the Answer back to Mobile via BLE!
	answerJSON, _ := json.Marshal(answer)
	reply := []byte(`{"type": "WEBRTC_ANSWER", "payload": ` + string(answerJSON) + `}`)
	SendToPrivileged(reply)

	log.Println("Sent WebRTC Answer via BLE")
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
