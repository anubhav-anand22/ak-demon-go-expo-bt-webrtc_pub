import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, ScanMode } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { appLogger } from "./persistantLog";

export class BTHandler {
  private static instance: BTHandler;
  private static manager: BleManager;
  private SERVICE_UUID = "7a8e9c3b-5e2f-4d9b-b6f1-3c4a8d2e7f10";
  private WRITE_UUID = "c1f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a44";
  private NOTIFY_UUID = "d2f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a55";
  private messageBuffer = "";
  private onMsgFnArr = new Map<string, (msg: Partial<BTMsgFrom>) => void>();
  private onConnectionChangeFnArr = new Map<string, (connectionState: BTConnectionState) => void>();
  private onLogEventCallbackList = new Map<string, (...msg: string[]) => void>();
  public connectionState: BTConnectionState = "DISCONNECTED";
  private activeDevice: Device | null = null;
  private isTransmitting = false;
  private txQueue: BTMsgTo[] = [];

  private constructor() {}

  public static getInstance() {
    if (!BTHandler.instance) {
      BTHandler.instance = new BTHandler();
    }
    if (!BTHandler.manager) {
      BTHandler.manager = new BleManager();
    }
    return BTHandler.instance;
  }

  private log(...msg: string[]) {
    this.onLogEventCallbackList.forEach((cb) => cb(...msg));
    console.log(...msg);
    appLogger.info(...msg);
  }
  private errLog(...msg: string[]) {
    this.onLogEventCallbackList.forEach((cb) => cb(...msg));
    console.log(...msg);
    appLogger.error(...msg);
  }

  public async requestBluetoothPermissions() {
    if (Platform.OS === "android") {
      if (Platform.Version >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          result["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location permission to scan for devices.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          },
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  public getDevice(manager: BleManager): Promise<{ device: Device }> {
    this.log("Getting BT devices");
    return new Promise((resolve, reject) => {
      let isConnecting = false;
      manager.startDeviceScan(
        [this.SERVICE_UUID],
        {
          scanMode: ScanMode.LowLatency,
        },
        async (err, device) => {
          if (err) {
            console.log(err);
            this.errLog("Error while getting BT devices");
            reject(err);
          } else if (device?.name && device.serviceUUIDs && !isConnecting) {
            for (let uuid of device.serviceUUIDs) {
              if (uuid === this.SERVICE_UUID) {
                this.log("Found BT device, trying to connect");
                isConnecting = true;
                manager.stopDeviceScan();

                try {
                  let connectedDevice = await manager.connectToDevice(device.id);
                  this.log("Successfully connected to BT device");
                  if (Platform.OS === "android") {
                    try {
                      console.log("Requesting MTU of 512...");
                      this.log("Requesting larger MTU");
                      // The hardware might not grant 512, but it will grant the highest it supports
                      connectedDevice = await connectedDevice.requestMTU(512);
                      console.log(`✅ Successfully negotiated MTU: ${connectedDevice.mtu}`);
                      this.log(`Got MTU of size: ${connectedDevice.mtu}`);
                    } catch (mtuError) {
                      console.warn("⚠️ Failed to negotiate MTU, sticking to default 23:", mtuError);
                      this.errLog("Error while requesting larger MTU");
                    }
                  }

                  this.log("Discovering all services and characteristics");
                  await connectedDevice.discoverAllServicesAndCharacteristics();
                  resolve({ device: connectedDevice });
                } catch (e) {
                  reject(e);
                  this.errLog("Error while connecting to device");
                } finally {
                  isConnecting = false;
                }
              }
            }
          }
        },
      );
    });
  }

  private updateConnectionState(status: BTConnectionState) {
    this.connectionState = status;
    this.onConnectionChangeFnArr.forEach((cb) => cb(status));
    this.log(`BT Connecting state: ${status}`);
  }

  public async init(manager: BleManager = BTHandler.manager) {
    try {
      this.log("Initiating BT handler");
      if (this.connectionState !== "DISCONNECTED") {
        this.log("Aborting initiation of BT handler, connecting state is not Disconnected");
        return;
      }
      this.updateConnectionState("CONNECTING");
      this.log("Requesting BT permission");
      const hasPermission = await this.requestBluetoothPermissions();
      if (!hasPermission) {
        console.warn("User denied Bluetooth permissions");
        this.errLog("User denied Bluetooth permissions");
        return;
      }
      console.log("Got user permission for BT");
      this.log("Got user permission for BT");

      const { device } = await this.getDevice(manager);
      console.log({ mtu: device.mtu });

      this.activeDevice = device;

      manager.onDeviceDisconnected(device.id, (error, dev) => {
        console.warn("BLE Device Disconnected from Go App!", error?.message);
        this.log("BLE Device Disconnected from Go App!", error?.message || "");
        this.activeDevice = null;
        this.updateConnectionState("DISCONNECTED");
      });

      device.monitorCharacteristicForService(this.SERVICE_UUID, this.NOTIFY_UUID, (error, char) => {
        if (error) {
          console.error("Monitor Error (Device disconnected?):", error);
          this.errLog("Monitor Error (Device disconnected?):", error.message);
          return;
        }

        if (char?.value) {
          const chunk = Buffer.from(char.value, "base64").toString("utf-8");
          this.messageBuffer += chunk;

          // THE FIX: Use a while loop to extract EVERY complete message currently in the buffer
          let newlineIdx;
          while ((newlineIdx = this.messageBuffer.indexOf("\n")) !== -1) {
            try {
              const completeJsonString = this.messageBuffer.substring(0, newlineIdx).trim();

              // Ignore empty strings caused by accidental double newlines
              if (completeJsonString) {
                const parsedData = JSON.parse(completeJsonString) as Partial<BTMsgFrom>;
                this.log("🔥 Successfully received full message from Go:", parsedData.type ?? "");

                this.onMsgFnArr.forEach((cb) => {
                  cb(parsedData);
                });
              }
            } catch (parseError) {
              // If a packet gets dropped and JSON is invalid, log it but let the finally block clear it!
              console.log(parseError);
              this.errLog(
                "Failed to parse incoming JSON:",
                this.messageBuffer.substring(0, newlineIdx),
              );
            } finally {
              // Safely slice out the processed message, keeping any new chunks intact for the next loop iteration
              this.messageBuffer = this.messageBuffer.substring(newlineIdx + 1);
            }
          }
        }
      });

      setTimeout(() => {
        this.updateConnectionState("CONNECTED");
        console.log("send msg");
        this.sendData({ type: "TEST" });
      }, 100);
    } catch (e) {
      console.log(e);
      this.updateConnectionState("DISCONNECTED");
    }
  }

  public async sendData(jsonData: BTMsgTo) {
    if (!this.activeDevice) {
      this.log("Cannot send data: Not connected to Go app yet.");
      return;
    }
    this.log("Sending data via BT send queue");

    this.txQueue.push(jsonData);

    if (!this.isTransmitting) {
      this.processQueue();
    }
  }

  private async processQueue() {
    // 1. Lock the engine so nobody else can start it
    this.isTransmitting = true;

    // 2. Loop continuously as long as there is data in the queue
    while (this.txQueue.length > 0) {
      // Grab the first item (FIFO)
      const jsonData = this.txQueue.shift();
      if (!jsonData) continue;

      try {
        const jsonString = JSON.stringify(jsonData) + "\n";
        const rawBytes = Buffer.from(jsonString, "utf-8");
        const safeMtu = this.activeDevice!.mtu ? this.activeDevice!.mtu - 3 : 20;
        const chunkSize = Math.min(safeMtu, 512);

        this.log(`[TX Engine] Processing chunk of ${rawBytes.length} bytes...`);

        // Transmit the chunks sequentially
        for (let i = 0; i < rawBytes.length; i += chunkSize) {
          const chunk = rawBytes.subarray(i, i + chunkSize);
          const base64Chunk = Buffer.from(chunk).toString("base64");

          await this.activeDevice!.writeCharacteristicWithoutResponseForService(
            this.SERVICE_UUID,
            this.WRITE_UUID,
            base64Chunk,
          );

          // Give the hardware a tiny break between BLE writes
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        this.errLog("[TX Engine] Failed to send data");
        console.error("[TX Engine] Failed to send data:", error);
      }
    } // End of while loop. The queue is now completely empty!

    // 3. Turn the engine off
    this.isTransmitting = false;
    this.log("[TX Engine] Queue empty. Idling.");
  }

  public getManager() {
    return BTHandler.manager;
  }

  public onMsg(cb: (msg: Partial<BTMsgFrom>) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.onMsgFnArr.set(id, cb);
    return () => {
      this.onMsgFnArr.delete(id);
    };
  }

  public onConnectionChange(cb: (connectionState: BTConnectionState) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.onConnectionChangeFnArr.set(id, cb);

    // Immediately fire the callback with the current state when a component subscribes
    cb(this.connectionState);

    return () => {
      this.onConnectionChangeFnArr.delete(id);
    };
  }

  public onLog(cb: (...msg: string[]) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.onLogEventCallbackList.set(id, cb);

    return () => {
      this.onLogEventCallbackList.delete(id);
    };
  }
}
