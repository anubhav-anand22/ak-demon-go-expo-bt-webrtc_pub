# AK Demon — Secure Mobile-to-Linux Remote Bridge

A serverless, end-to-end encrypted remote access system that connects an Android phone to a Linux machine using **Bluetooth Low Energy** for signaling and **WebRTC** for high-throughput peer-to-peer data transfer — with zero cloud dependency.

---

## Architecture Overview

```
┌─────────────────────┐         BLE (Signaling)          ┌──────────────────────────────────┐
│                     │◄────────────────────────────────►│          Linux Machine            │
│   Android Phone     │                                  │                                  │
│   (Expo / React     │         WebRTC (Data)            │  ┌────────────────────────────┐  │
│    Native App)      │◄────────────────────────────────►│  │  Privileged Daemon (root)  │  │
│                     │                                  │  │  - BLE Peripheral (GATT)   │  │
└─────────────────────┘                                  │  │  - RSA Key Management      │  │
                                                         │  │  - Process Supervision     │  │
                                                         │  └─────────┬──────────────────┘  │
                                                         │            │ Unix Socket          │
                                                         │            │ (SO_PEERCRED PID     │
                                                         │            │  verification)       │
                                                         │  ┌─────────▼──────────────────┐  │
                                                         │  │ Unprivileged Daemon (uid    │  │
                                                         │  │  1000)                      │  │
                                                         │  │  - WebRTC Peer Connection   │  │
                                                         │  │  - NaCl E2E Encryption      │  │
                                                         │  │  - HTTP/WebSocket Server    │  │
                                                         │  │  - SolidJS Web UI           │  │
                                                         │  └────────────────────────────┘  │
                                                         └──────────────────────────────────┘
```

---

## Components

### 📱 Mobile App — `expo-ak-demon/`

React Native (Expo SDK 54) Android app that acts as the remote controller.

| Module | Purpose |
|---|---|
| `BTHandler.ts` | BLE scanning, connection, MTU negotiation, chunked TX/RX queue over GATT |
| `WebRTCHandler.ts` | WebRTC offer/answer via BLE signaling, DataChannel management, chunked large message transfer |
| `CryptoHandler.ts` | NaCl (Curve25519 + XSalsa20-Poly1305) key pair generation, authenticated encrypt/decrypt |
| `BtCryptoConnectionToPri.ts` | RSA public key exchange state machine over Bluetooth |
| `persistantLog.tsx` | On-device persistent file logging |

**Key dependencies:** `react-native-ble-plx`, `react-native-webrtc`, `tweetnacl`, `expo-secure-store`, `expo-file-system`

---

### 🖥️ Linux Backend — `go-ak-demon/`

Three compiled Go binaries forming a privilege-separated daemon architecture:

#### 1. Privileged Daemon — `privileged-go-ak-demon/`

Runs as **root** via systemd. Minimal attack surface — only handles BLE and IPC.

- Exposes a **BLE GATT peripheral** using `tinygo.org/x/bluetooth` with dedicated RX/TX characteristics
- Generates and stores **RSA-2048** key pairs with restrictive file permissions (`0600`)
- Performs **public key exchange** with the mobile app over Bluetooth
- Spawns and supervises the unprivileged worker via `exec.Command` with `Credential{Uid: 1000, Gid: 1000}`
- Communicates with the unprivileged process over a **Unix domain socket** (`/var/run/ble_bridge.sock`) with `SO_PEERCRED` PID verification
- Implements chunked BLE writes (500-byte chunks with 10ms spacing) to prevent hardware buffer overflow

#### 2. Unprivileged Daemon — `unprivileged-go-ak-demon/`

Runs as a **non-root user** (uid 1000). Handles all application logic.

- Connects to the privileged daemon via Unix socket for BLE message relay
- Manages **WebRTC peer connections** using `pion/webrtc/v3` (STUN + TURN)
- Implements **NaCl (Curve25519)** end-to-end encryption via `golang.org/x/crypto/nacl/box`
- Supports a **chunked encrypted transfer protocol** — large payloads are split into 10KB chunks, individually encrypted, and reassembled on the receiver
- Serves a **Gin HTTP server** on `:8080` with WebSocket support
- Hosts a **SolidJS web frontend** (or proxies to dev server in development mode)

#### 3. Systemd Manager — `systemd-manager-go-ak-demon/`

Interactive CLI tool (run with `sudo`) to install/remove the privileged daemon as a systemd service (`ble-bridge.service`).

---

## Communication Flow

```
Mobile App                    Privileged Daemon              Unprivileged Daemon
    │                               │                               │
    │──── BLE Scan & Connect ──────►│                               │
    │◄─── MTU Negotiation ─────────│                               │
    │                               │                               │
    │◄─── RSA PubKey Exchange ────►│                               │
    │                               │                               │
    │──── WebRTC Offer (via BLE) ──►│── Unix Socket Forward ──────►│
    │                               │                               │── Create PeerConnection
    │                               │◄── WebRTC Answer ────────────│
    │◄─── WebRTC Answer (via BLE) ──│                               │
    │                               │                               │
    │◄─── ICE Candidates ─────────►│◄──────── ICE Relay ─────────►│
    │                               │                               │
    │◄════ WebRTC DataChannel (P2P, encrypted) ══════════════════►│
    │                               │                               │
    │──── NaCl PubKey Exchange ────────────────────────────────────►│
    │◄─── NaCl PubKey Exchange ────────────────────────────────────│
    │                               │                               │
    │◄═══ E2E Encrypted Messages (chunked NaCl) ═════════════════►│
```

---

## Security Model

| Layer | Mechanism | Purpose |
|---|---|---|
| **BLE Signaling** | RSA-2048 OAEP (SHA-256) | Authenticate initial BLE key exchange |
| **WebRTC Data** | NaCl Box (Curve25519 + XSalsa20-Poly1305) | End-to-end authenticated encryption for all data channel traffic |
| **Process Isolation** | Privilege separation (root/non-root) | Minimize root-level attack surface |
| **IPC** | Unix socket + `SO_PEERCRED` PID verification | Only the spawned child process can connect to the privileged daemon |
| **Key Storage** | `0600` file permissions, `/var/lib/ak-demon/bt_keys/` | Private keys are owner-readable only |

---

## Setup & Deployment

### Prerequisites

- **Linux machine** with Bluetooth hardware and BlueZ stack
- **Go 1.21+** with TinyGo Bluetooth support
- **Node.js 18+** and **npm**
- **Android device** with BLE support

### Build the Go Backend

```bash
cd go-ak-demon
bash setup.sh
```

This script will:
1. Compile all three Go binaries (`manager`, `privileged`, `unprivileged`)
2. Move `privileged` and `unprivileged` to `/usr/local/bin/`
3. Copy the SolidJS frontend to `~/.ak-demon/unprivileged/pub/`
4. Set executable permissions and grant raw network capabilities to the privileged binary

### Install as Systemd Service

```bash
sudo ./manager
```

Follow the interactive prompt to install or remove the `ble-bridge.service`.

### Configure UUIDs

Before running, ensure the BLE Service UUID and Characteristic UUIDs match across:
- `privileged-go-ak-demon/main.go` → `UUID`, `RxCharUUID`, `TxCharUUID`
- `expo-ak-demon/lib/BTHandler.ts` → `SERVICE_UUID`, `WRITE_UUID`, `NOTIFY_UUID`

### Build the Mobile App

```bash
cd expo-ak-demon
npm install
npx expo run:android
```

---

## Project Structure

```
ak-demon-go-expo-bt-webrtc/
├── expo-ak-demon/                          # React Native (Expo) mobile app
│   ├── app/                                # Screens (file-based routing)
│   │   ├── (tabs)/
│   │   │   ├── index.tsx                   # Main control screen
│   │   │   └── explore.tsx                 # Secondary screen
│   │   └── Log.tsx                         # Log viewer screen
│   ├── lib/
│   │   ├── BTHandler.ts                    # BLE connection & data transfer
│   │   ├── WebRTCHandler.ts                # WebRTC peer connection management
│   │   ├── CryptoHandler.ts                # NaCl encryption (TweetNaCl)
│   │   ├── BtCryptoConnectionToPri.ts      # BLE crypto key exchange state machine
│   │   └── persistantLog.tsx               # File-based logging
│   ├── type.d.ts                           # TypeScript type definitions
│   └── app.config.ts                       # Expo config with custom APK naming
│
├── go-ak-demon/                            # Go backend (Linux)
│   ├── privileged-go-ak-demon/             # Root daemon — BLE + IPC
│   │   ├── main.go                         # BLE peripheral, key mgmt, process supervisor
│   │   ├── parseBTMsgFromMob.go            # BLE message parser
│   │   └── parseJsonMsgFromUnPri.go        # Unix socket message parser
│   ├── unprivileged-go-ak-demon/           # User daemon — WebRTC + HTTP
│   │   ├── main.go                         # WebRTC, Gin server, IPC client
│   │   ├── lib/
│   │   │   ├── encryptDecrypt.go           # NaCl Box encryption (Curve25519)
│   │   │   ├── parseFrontendMsgJson.go     # WebSocket message parser
│   │   │   ├── parsePriMsgJson.go          # Privileged IPC message parser
│   │   │   ├── parseRTCMsgReceived.go      # WebRTC DataChannel message parser
│   │   │   └── sendDataViaRTCToMob.go      # WebRTC data sender
│   │   └── unprivileged-solidjs-ak-demon/  # SolidJS web frontend (Vite)
│   ├── systemd-manager-go-ak-demon/        # Systemd service installer CLI
│   │   └── manager.go
│   └── setup.sh                            # Build & deploy script
│
└── setup.txt                               # Quick setup notes
```

---

## Tech Stack

| Area | Technology |
|---|---|
| Mobile | React Native, Expo SDK 54, TypeScript |
| BLE | `react-native-ble-plx` (mobile), `tinygo.org/x/bluetooth` (Linux) |
| WebRTC | `react-native-webrtc` (mobile), `pion/webrtc/v3` (Go) |
| Encryption | TweetNaCl / NaCl Box (Curve25519 + XSalsa20-Poly1305), RSA-2048 |
| Backend | Go, Gin, gorilla/websocket |
| Web Frontend | SolidJS, Vite, TailwindCSS |
| Process Mgmt | systemd, Unix domain sockets |
| Build | EAS Build (Android APK), Go compiler |
