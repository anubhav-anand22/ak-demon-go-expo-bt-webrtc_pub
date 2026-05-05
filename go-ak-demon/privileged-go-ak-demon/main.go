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

	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"

	"tinygo.org/x/bluetooth"
)

const (
	socketPath       = "/var/run/ble_bridge.sock"
	TargetDeviceName = "realme C67 5G"
	BtKeyFolder      = "/var/lib/ak-demon/bt_keys/"
)

var (
	UUID, _       = bluetooth.ParseUUID("7a8e9c3b-5e2f-4d9b-b6f1-3c4a8d2e7f10")
	RxCharUUID, _ = bluetooth.ParseUUID("c1f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a44")
	TxCharUUID, _ = bluetooth.ParseUUID("d2f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a55")
	adapter       = bluetooth.DefaultAdapter
	btMobPubKey   = make(chan []byte)
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

	err := GenerateAndSecureKeys()
	if err != nil {
		log.Fatalf("Failed to generate and secure keys: %v", err)
	}

	_, _, pubKeyByte, err := getPubPrivateKey()
	if err != nil {
		log.Fatalf("Failed to load keys: %v", err)
	}

	setupBluetooth()
	setupPref()

	ExchangePublicKey(pubKeyByte, &txCharacteristic)

	//TODO: send encrypted msg test from Go to Mob using the BT connection to open the lock
	// sendMsg(struct {
	// 	Type    string `json:"type"`
	// }{
	// 	Type:    "REQUEST_TO_VERIFY",
	// }, &txCharacteristic)

	// sendMsg(struct {
	// 	Type string `json:"type"`
	// }{
	// 	Type: "BT_PUB_KEY_EXCHANGE_FROM_PRI",
	// }, &txCharacteristic)

	// for {
	// 	log.Println("Starting unprivileged worker...")

	// 	// Notice we removed the "go" keyword.
	// 	// This will BLOCK until the worker process dies/exits.
	// 	runWorkerLoop(&txCharacteristic)

	// 	log.Println("Worker process exited or lost connection. Restarting in 2 seconds...")
	// 	time.Sleep(2 * time.Second)
	// }
}

func ensureDir(path string, perm os.FileMode) error {
	_, err := os.Stat(path)
	if os.IsNotExist(err) {
		return os.MkdirAll(path, perm) // secure permissions
	}
	return err // nil if exists, or actual error
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func decodePEMFile(path string) (*pem.Block, []byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, nil, err
	}

	return block, data, nil
}

func getPubPrivateKey() (priKeyR *rsa.PrivateKey, pubKeyR *rsa.PublicKey, pubKeyByteR []byte, errR error) {
	block, _, err := decodePEMFile(BtKeyFolder + "private.pem")
	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, nil, nil, err
	}

	pubBlock, pubRawData, err := decodePEMFile(BtKeyFolder + "public.pem")
	pubInterface, err := x509.ParsePKIXPublicKey(pubBlock.Bytes)
	if err != nil {
		return nil, nil, nil, err
	}
	pubKey := pubInterface.(*rsa.PublicKey)

	return privKey, pubKey, pubRawData, nil
}

func GenerateAndSecureKeys() error {

	err := ensureDir(BtKeyFolder, 0700)
	if err != nil {
		return err
	}
	privFilePath := BtKeyFolder + "private.pem"
	pubFilePath := BtKeyFolder + "public.pem"

	priKeyExists := fileExists(privFilePath)
	pubKeyExists := fileExists(pubFilePath)

	if priKeyExists && pubKeyExists {
		log.Println("Keys already exist. Skipping generation.")
		return nil
	}

	// Generate 2048-bit RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	// 1. Save Private Key (Permissions: 0600 - Read/Write for Owner ONLY)
	privFile, err := os.OpenFile(privFilePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer privFile.Close()

	privBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	pem.Encode(privFile, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: privBytes})

	// 2. Save Public Key (Permissions: 0644 - Owner write, others read)
	pubFile, err := os.OpenFile(pubFilePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer pubFile.Close()

	pubBytes, _ := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	pem.Encode(pubFile, &pem.Block{Type: "PUBLIC KEY", Bytes: pubBytes})

	log.Println("Keys generated and file permissions set to privileged access.")
	return nil
}

func ExchangePublicKey(pubKeyByte []byte, targetChar *bluetooth.Characteristic) []byte {
	// Create a wrapper struct compatible with your ParseBTMsg logic
	msg := struct {
		Type    string `json:"type"`
		Payload string `json:"pub_key"`
	}{
		Type:    "BT_PUB_KEY_EXCHANGE_FROM_PRI",
		Payload: string(pubKeyByte),
	}

	sendMsg(msg, targetChar)
	log.Println("Public key sent to connected device.")
	if len(btMobPubKey) == 0 {
		return <-btMobPubKey
	} else {
		return nil
	}

}

func EncryptPlainTxt(plainText string, remotePubKeyPEM []byte) ([]byte, error) {
	block, _ := pem.Decode(remotePubKeyPEM)
	pubInterface, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	pub := pubInterface.(*rsa.PublicKey)

	// Encrypt using OAEP padding for security
	cipherText, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, pub, []byte(plainText), nil)
	if err != nil {
		return nil, err
	}
	return cipherText, nil
}

func DecryptToPlainText(cipherText []byte, privKey *rsa.PrivateKey) (string, error) {
	plainText, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, privKey, cipherText, nil)
	if err != nil {
		return "", err
	}

	return string(plainText), nil
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
				case BTPubKeyExchangeFromMob:
					log.Printf("Received public key from mobile via BT")
					log.Printf("Payload: %s", string(v.Payload))
					btMobPubKey <- v.Payload
				default:
					log.Printf("BT msg type did not match any case")
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
		// var req map[string]string
		// if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
		// 	log.Printf("Error %s", err)
		// 	continue
		// }

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
		case WebRTCAnswerFromUnpri:
			log.Printf("Forwarding WebRTC ANSWER to Mobile via BT")
			sendMsg(v, targetChar)
		case WebRTCICEFromUnpri:
			log.Printf("Forwarding WebRTC ICE to Mobile via BT")
			sendMsg(v, targetChar)
		}
	}
}

func sendMsg(msg any, targetChar *bluetooth.Characteristic) {
	jsonData, _ := json.Marshal(msg)

	// 2. Add an EOF marker so Android knows when to parse it
	jsonData = append(jsonData, '\n')

	const CHUNK_SIZE = 500

	// 3. Chunk and send!
	for i := 0; i < len(jsonData); i += CHUNK_SIZE {
		end := i + CHUNK_SIZE
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
