import { BTHandler } from "./BTHandler";
import { CryptoHandler } from "./CryptoHandler";

type State = {
  keySendToPri: boolean;
  keyReceivedFromPri: boolean;
  isConnected: boolean;
};

export class BtCryptoConnection {
  private static instance: BtCryptoConnection;
  private crypto: CryptoHandler;
  private cleanUpFns: (() => void)[] = [];
  private state: State = {
    keySendToPri: false,
    keyReceivedFromPri: false,
    isConnected: false,
  };
  private onStateChangeCBList = new Map<string, (state: State) => void>();

  private constructor() {
    let unSub = BTHandler.getInstance().onConnectionChange(this.handleBTconnectionChange);
    this.cleanUpFns.push(unSub);

    unSub = BTHandler.getInstance().onMsg((msg) => {
      console.log({ msg });
      if (msg.type === "BT_PUB_KEY_EXCHANGE_FROM_PRI" && msg.payload) {
        this.crypto.setPeerPublicKey(msg.payload);
        this.setState({ keyReceivedFromPri: true });
      }
    });
    this.cleanUpFns.push(unSub);

    this.crypto = CryptoHandler.getNewInstance();
  }

  public static getInstance() {
    if (!BtCryptoConnection.instance) {
      BtCryptoConnection.instance = new BtCryptoConnection();
    }
    return BtCryptoConnection.instance;
  }

  private handleBTconnectionChange(connectionState: BTConnectionState) {
    if (connectionState === "CONNECTED") {
      const pubKey = this.crypto.getMyPublicKeyBase64();
      BTHandler.getInstance().sendData({ type: "BT_PUB_KEY_EXCHANGE_FROM_MOB", payload: pubKey });
      this.setState({ keySendToPri: true });
    } else if (connectionState === "DISCONNECTED") {
      this.setState({ isConnected: false });
    }
  }

  private setState(state: Partial<State>) {
    for (let s in state) {
      const key = s as keyof State;
      if (state[key]) this.state[key] = state[key];
    }
    if (this.state.keySendToPri && this.state.keyReceivedFromPri && !this.state.isConnected) {
      this.setState({ isConnected: true });
      return;
    }
    this.onStateChangeCBList.forEach((cb) => cb(this.state));
  }

  public getState() {
    return this.state;
  }

  public onStateChange(cb: (state: State) => void) {
    const id = `${Math.random()}-${new Date().getTime()}`;
    this.onStateChangeCBList.set(id, cb);

    return () => {
      this.onStateChangeCBList.delete(id);
    };
  }

  public sendEncryptedMsg(msg: BtEncMsgToPri) {
    const encMsg = this.crypto.encryptMessage(msg);
    const encMsgJson = JSON.stringify(encMsg);
    BTHandler.getInstance().sendData({ type: msg.type, payload: encMsgJson });
  }

  public dcryptMsg(nonceBase64: string, ciphertextBase64: string) {
    return this.crypto.decryptMessage(nonceBase64, ciphertextBase64);
  }

  public cleanUp() {
    this.cleanUpFns.forEach((e) => e());
    this.setState({ isConnected: false, keyReceivedFromPri: false, keySendToPri: false });
  }
}
