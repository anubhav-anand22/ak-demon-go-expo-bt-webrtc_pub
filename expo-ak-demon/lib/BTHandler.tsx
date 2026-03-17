import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Characteristic, Device, ScanMode } from "react-native-ble-plx";
import { Buffer } from "buffer";

export class BTHandler {
  private static instance: BTHandler;
  private static manager: BleManager;
  private SERVICE_UUID = "7a8e9c3b-5e2f-4d9b-b6f1-3c4a8d2e7f10";
  private WRITE_UUID = "c1f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a44";
  private NOTIFY_UUID = "d2f4a2b8-6d7e-4a53-9f12-0e3b7c9d5a55";
  private messageBuffer = "";
  private onMsgFnArr = new Map<string, (msg: Partial<BTMsgFrom>) => void>();
  private onConnectionChangeFnArr = new Map<string, (isConnected: boolean) => void>();
  public isConnected = false;
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
            reject(err);
          }
          if (device?.name && device.serviceUUIDs && !isConnecting) {
            for (let uuid of device.serviceUUIDs) {
              if (uuid === this.SERVICE_UUID) {
                isConnecting = true;
                manager.stopDeviceScan();

                try {
                  let connectedDevice = await manager.connectToDevice(device.id);

                  if (Platform.OS === "android") {
                    try {
                      console.log("Requesting MTU of 512...");
                      // The hardware might not grant 512, but it will grant the highest it supports
                      connectedDevice = await connectedDevice.requestMTU(512);
                      console.log(`✅ Successfully negotiated MTU: ${connectedDevice.mtu}`);
                    } catch (mtuError) {
                      console.warn("⚠️ Failed to negotiate MTU, sticking to default 23:", mtuError);
                    }
                  }

                  await connectedDevice.discoverAllServicesAndCharacteristics();
                  resolve({ device: connectedDevice });
                } catch (e) {
                  reject(e);
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

  private updateConnectionState(status: boolean) {
    this.isConnected = status;
    this.onConnectionChangeFnArr.forEach((cb) => cb(status));
  }

  public async init(manager: BleManager = BTHandler.manager) {
    try {
      if (this.isConnected) return;
      const hasPermission = await this.requestBluetoothPermissions();
      if (!hasPermission) {
        console.warn("User denied Bluetooth permissions");
        return;
      }
      console.log("Got user permission for BT");

      const { device } = await this.getDevice(manager);
      console.log({ mtu: device.mtu });

      this.activeDevice = device;

      manager.onDeviceDisconnected(device.id, (error, dev) => {
        console.warn("BLE Device Disconnected from Go App!", error?.message);
        this.activeDevice = null;
        this.updateConnectionState(false);
      });

      // 4. Monitor the NOTIFY UUID specifically
      device.monitorCharacteristicForService(this.SERVICE_UUID, this.NOTIFY_UUID, (error, char) => {
        if (error) {
          console.error("Monitor Error (Device disconnected?):", error);
          return;
        }

        if (char?.value) {
          const chunk = Buffer.from(char.value, "base64").toString("utf-8");
          this.messageBuffer += chunk;

          // 5. Improved Buffer Clearing: Only clear up to the newline in case
          // the next message's chunks have already started arriving!
          const newlineIdx = this.messageBuffer.indexOf("\n");
          if (newlineIdx !== -1) {
            try {
              const completeJsonString = this.messageBuffer.substring(0, newlineIdx).trim();
              const parsedData = JSON.parse(completeJsonString) as Partial<BTMsgFrom>;

              console.log("🔥 Successfully received full message from Go:", parsedData);

              this.onMsgFnArr.forEach((cb) => {
                cb(parsedData);
              });
            } catch (parseError) {
              console.error("Failed to parse incoming JSON:", this.messageBuffer);
            } finally {
              // Safely slice out the processed message, keeping any new chunks intact
              this.messageBuffer = this.messageBuffer.substring(newlineIdx + 1);
            }
          }
        }
      });

      setTimeout(() => {
        this.updateConnectionState(true);
        console.log("send msg");
        this.sendData({ type: "TEST" });
      }, 100);
    } catch (e) {
      console.log(e);
      this.updateConnectionState(false);
    }
  }

  public async sendData(jsonData: BTMsgTo) {
    if (!this.activeDevice) {
      console.warn("Cannot send data: Not connected to Go app yet.");
      return;
    }

    this.txQueue.push(jsonData);

    if (!this.isTransmitting) {
      this.processQueue();
    }

    // try {
    //   // 1. Stringify and append the EOF marker
    //   const jsonString = JSON.stringify(jsonData) + "\n";

    //   // 2. Convert the entire string into an array of raw bytes
    //   const rawBytes = Buffer.from(jsonString, "utf-8");

    //   // 3. Define the safe payload size (20 bytes is the universal BLE default)
    //   // If you saved the negotiated device.mtu earlier, you can change this to (mtu - 3)
    //   const chunkSize = 20;

    //   console.log(`Preparing to send ${rawBytes.length} bytes...`);

    //   for (let i = 0; i < rawBytes.length; i += chunkSize) {
    //     // Slice the raw bytes (this returns a Uint8Array)
    //     const chunk = rawBytes.subarray(i, i + chunkSize);

    //     // THE FIX: Wrap the chunk in a new Buffer before encoding!
    //     const base64Chunk = Buffer.from(chunk).toString("base64");

    //     // Send it Without Response
    //     await this.activeDevice.writeCharacteristicWithoutResponseForService(
    //       this.SERVICE_UUID,
    //       this.WRITE_UUID,
    //       base64Chunk,
    //     );

    //     // 5. CRITICAL: Add a tiny delay (10-15ms)
    //     await new Promise((resolve) => setTimeout(resolve, 15));
    //   }

    //   // // 4. Loop through the bytes and send them in chunks
    //   // for (let i = 0; i < rawBytes.length; i += chunkSize) {
    //   //   // Slice the raw bytes (subarray is standard for Node Buffers)
    //   //   const chunk = rawBytes.subarray(i, i + chunkSize);

    //   //   // Convert ONLY this specific 20-byte chunk into Base64
    //   //   const base64Chunk = chunk.toString("base64");

    //   //   // Send it Without Response
    //   //   await this.activeCharacteristic.writeWithoutResponse(base64Chunk);

    //   //   // 5. CRITICAL: Add a tiny delay (10-15ms)
    //   //   // If React Native fires these promises too fast, the Bluetooth radio
    //   //   // hardware buffer overflows and silently drops packets!
    //   //   await new Promise((resolve) => setTimeout(resolve, 15));
    //   // }

    //   console.log(`Successfully sent all ${rawBytes.length} bytes to Go!`);
    // } catch (error) {
    //   console.error("Failed to send data:", error);
    // }
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

        console.log(`[TX Engine] Processing chunk of ${rawBytes.length} bytes...`);

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
        console.error("[TX Engine] Failed to send data:", error);
      }
    } // End of while loop. The queue is now completely empty!

    // 3. Turn the engine off
    this.isTransmitting = false;
    console.log("[TX Engine] Queue empty. Idling.");
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

  public onConnectionChange(cb: (isConnected: boolean) => void) {
    const id = Math.random() + "-" + new Date().getTime();
    this.onConnectionChangeFnArr.set(id, cb);

    // Immediately fire the callback with the current state when a component subscribes
    cb(this.isConnected);

    return () => {
      this.onConnectionChangeFnArr.delete(id);
    };
  }
}
