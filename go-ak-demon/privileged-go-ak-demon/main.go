package main

import (
	// "bufio"
	// "encoding/json"
	"bufio"
	"bytes"
	"encoding/json"
	"log"
	"net"
	"sync"
	"syscall"
	"time"

	// "net"
	"os"
	"os/exec"

	"tinygo.org/x/bluetooth"
)

const (
	socketPath       = "/var/run/ble_bridge.sock"
	TargetDeviceName = "realme C67 5G"
)

var (
	UUID, _       = bluetooth.ParseUUID("7a8e9c3b-5e2f-4d9b-b6f1-3c4a8d2e7f10")
	RxCharUUID, _ = bluetooth.ParseUUID("c1f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a44")
	TxCharUUID, _ = bluetooth.ParseUUID("d2f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a55")
	adapter       = bluetooth.DefaultAdapter
)

var txCharacteristic bluetooth.Characteristic
var rxBuffer []byte
var rxMutex sync.Mutex

var activeWorkerConn *net.UnixConn
var workerConnMutex sync.Mutex

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.SetPrefix("[PRIVILEGED] ")

	if os.Geteuid() != 0 {
		log.Print("This process must be run as root/admin.")
	}

	setupBluetooth()
	setupPref()

	for {
		log.Println("Starting unprivileged worker...")

		// Notice we removed the "go" keyword.
		// This will BLOCK until the worker process dies/exits.
		runWorkerLoop(&txCharacteristic)

		log.Println("Worker process exited or lost connection. Restarting in 2 seconds...")
		time.Sleep(2 * time.Second)
	}
}

func sendMsgToUnprivilegedApp(msg []byte) {
	workerConnMutex.Lock()
	if activeWorkerConn != nil {
		// Append a newline so the unprivileged app's scanner can read it
		payload := append(msg, '\n')

		_, err := activeWorkerConn.Write(payload)
		if err != nil {
			log.Printf("Failed to forward to unprivileged app: %v", err)
		} else {
			log.Printf("Forwarded %d bytes to unprivileged app", len(msg))
		}
	} else {
		log.Printf("Warning: Dropped BLE message, no unprivileged worker connected")
	}
	workerConnMutex.Unlock()
}

func setupPref() {
	log.Println("Enabling Bluetooth adapter...")
	// err := adapter.Enable()
	// if err != nil {
	// 	log.Print("Failed to enable BLE adapter: %v", err)
	// }

	rxConfig := bluetooth.CharacteristicConfig{
		UUID: RxCharUUID,
		// Phone is only allowed to Write here.
		Flags: bluetooth.CharacteristicWritePermission | bluetooth.CharacteristicWriteWithoutResponsePermission,
		WriteEvent: func(client bluetooth.Connection, offset int, value []byte) {
			rxMutex.Lock()
			// 1. Append the incoming chunk
			rxBuffer = append(rxBuffer, value...)

			// 2. Extract ALL complete messages from the buffer immediately
			var completeMessages [][]byte

			for {
				idx := bytes.IndexByte(rxBuffer, '\n')
				if idx == -1 {
					break // No more complete messages
				}

				// Extract the message and safely copy it to a new slice
				// so we don't accidentally hold onto the underlying array
				msgCopy := make([]byte, idx)
				copy(msgCopy, rxBuffer[:idx])
				completeMessages = append(completeMessages, msgCopy)

				// Shrink the buffer
				rxBuffer = rxBuffer[idx+1:]
			}

			// 3. UNLOCK IMMEDIATELY! Let the Bluetooth radio accept the next chunks.
			rxMutex.Unlock()

			// 4. Now, process all the messages we found outside of the lock
			for _, completeMsg := range completeMessages {
				log.Printf("🔥 Reassembled full JSON from mobile: %s", string(completeMsg))

				msg, err, didDefaulted := ParseBTMsgFromMob(completeMsg)

				if err != nil {
					log.Printf("Parse Error: %s", err.Error())
					continue
				}

				if didDefaulted {
					log.Printf("BT msg defaulted and did not match any case")
					continue
				}

				switch v := msg.(type) {
				case BTTestTypeMsg:
					log.Printf("BT msg type: %s", v.Type)
				case WebRTCOfferFromMob:
					log.Printf("Sending webrtc offer to unprivileged app from mob")
					sendMsgToUnprivilegedApp(completeMsg)
				case WebRTCICEFromMob:
					log.Printf("Sending webrtc ice to unprivileged app from mob")
					sendMsgToUnprivilegedApp(completeMsg)
				case MobReqToStartWebRTC:
					log.Printf("Sending webrtc start msg to unprivileged app from mob")
					sendMsgToUnprivilegedApp(completeMsg)
				}
			}
		},
	}

	// 2. The TX Characteristic (Go -> Mobile)
	txConfig := bluetooth.CharacteristicConfig{
		UUID: TxCharUUID,
		// Phone is only allowed to Read/Notify here.
		Flags:  bluetooth.CharacteristicReadPermission | bluetooth.CharacteristicNotifyPermission,
		Handle: &txCharacteristic, // Bind the handle here so sendMsg can use it!
		Value:  []byte("HELLO_FROM_GO"),
	}

	service := bluetooth.Service{
		UUID:            UUID,
		Characteristics: []bluetooth.CharacteristicConfig{rxConfig, txConfig},
	}

	err := adapter.AddService(&service)
	if err != nil {
		log.Printf("Failed to add service: %v", err)
	}

	adv := adapter.DefaultAdvertisement()
	err = adv.Configure(bluetooth.AdvertisementOptions{
		LocalName:    "Go Security Key", // The name that will show up on the phone
		ServiceUUIDs: []bluetooth.UUID{UUID},
	})
	if err != nil {
		log.Printf("Failed to configure advertisement: %v", err)
	}

	err = adv.Start()
	if err != nil {
		log.Printf("Failed to start advertising: %v", err)
	}

	log.Println("Peripheral is now Advertising! Waiting for connections...")

}

func setupBluetooth() {
	exec.Command("rfkill", "unblock", "bluetooth").Run()
	if err := adapter.Enable(); err != nil {
		log.Printf("Failed to enable Bluetooth adapter: %v", err)
	}
}

func runWorkerLoop(targetChar *bluetooth.Characteristic) {
	_ = os.Remove(socketPath)
	l, err := net.ListenUnix("unix", &net.UnixAddr{Name: socketPath, Net: "unix"})
	if err != nil {
		log.Printf("Socket error: %v", err)
		return
	}
	defer l.Close()

	os.Chmod(socketPath, 0666)

	cmd := exec.Command("/usr/local/bin/unprivileged")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Credential: &syscall.Credential{Uid: 1000, Gid: 1000},
	}
	cmd.Env = append(os.Environ(),
		"HOME=/home/anubhav_anand",
		"USER=anubhav_anand",
	)

	if err := cmd.Start(); err != nil {
		log.Printf("Worker start error: %v", err)
		return
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	go func() {
		for {
			conn, err := l.AcceptUnix()
			if err != nil {
				return
			}

			rawConn, _ := conn.File()
			ucred, err := syscall.GetsockoptUcred(int(rawConn.Fd()), syscall.SOL_SOCKET, syscall.SO_PEERCRED)

			if err == nil && int(ucred.Pid) == cmd.Process.Pid {
				go handleIPC(conn, targetChar)
			} else {
				conn.Close()
			}
		}
	}()

	<-done
}

func handleIPC(conn *net.UnixConn, targetChar *bluetooth.Characteristic) {
	defer conn.Close()

	workerConnMutex.Lock()
	activeWorkerConn = conn
	workerConnMutex.Unlock()

	defer func() {
		workerConnMutex.Lock()
		if activeWorkerConn == conn {
			activeWorkerConn = nil
		}
		workerConnMutex.Unlock()
		conn.Close()
	}()

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		var req map[string]string
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			log.Printf("Error %s", err)
			continue
		}

		rawMsg := scanner.Bytes()

		msg, err, didDefaulted := ParseJsonMsgFromUnPri(rawMsg)

		if err != nil {
			log.Print(err)
			continue
		}

		if didDefaulted {
			log.Printf("Msg defaulted:-")
			log.Printf("%s", scanner.Text())
			continue
		}

		switch v := msg.(type) {
		case TestMstToPriTypeMsg:
			log.Printf("Logged from unprivileged app")
		case TestMstToMobBtTypeMsg:
			log.Printf("Logged from unprivileged app to mob via bt")
			log.Printf("Sending JSON to mobile via BT")

			sendMsg(v, targetChar)
		}
	}
}

func sendMsg(msg any, targetChar *bluetooth.Characteristic) {
	jsonData, _ := json.Marshal(msg)

	// 2. Add an EOF marker so Android knows when to parse it
	jsonData = append(jsonData, '\n')

	// 3. Chunk and send!
	for i := 0; i < len(jsonData); i += 20 {
		end := i + 20
		if end > len(jsonData) {
			end = len(jsonData)
		}

		// Write Without Response is much faster for chunked data
		_, writeErr := targetChar.Write(jsonData[i:end])
		if writeErr != nil {
			log.Printf("Failed to write BT chunk: %v", writeErr)
			break
		}

		// Tiny delay to prevent overflowing the Bluetooth hardware buffer
		time.Sleep(10 * time.Millisecond)
	}
	log.Printf("Successfully sent %d bytes over BLE", len(jsonData))
}
