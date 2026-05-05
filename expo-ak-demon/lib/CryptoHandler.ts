import "react-native-get-random-values";
import nacl from "tweetnacl";
import util from "tweetnacl-util";

export class CryptoHandler {
  private static instance: CryptoHandler;

  private keyPair: nacl.BoxKeyPair;
  private peerPublicKey: Uint8Array | null = null;

  private constructor() {
    // Generate our keys the moment this class is instantiated
    this.keyPair = nacl.box.keyPair();
  }

  public static getInstance() {
    if (!CryptoHandler.instance) {
      CryptoHandler.instance = new CryptoHandler();
    }
    return CryptoHandler.instance;
  }

  public static getNewInstance() {
    return new CryptoHandler();
  }

  // Gets our public key as a Base64 string to send to Go
  public getMyPublicKeyBase64(): string {
    return util.encodeBase64(this.keyPair.publicKey);
  }

  // Saves Go's public key when we receive it
  public setPeerPublicKey(base64Key: string) {
    this.peerPublicKey = util.decodeBase64(base64Key);
  }

  public isReady(): boolean {
    return this.peerPublicKey !== null;
  }

  // Encrypts a JSON payload
  public encryptMessage(jsonObject: any): { nonce: string; ciphertext: string } {
    if (!this.peerPublicKey) throw new Error("Peer public key not set!");

    const messageString = JSON.stringify(jsonObject);
    const messageUint8 = util.decodeUTF8(messageString);

    // Nonces MUST be unique for every single message. We generate a random 24-byte nonce.
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    const encrypted = nacl.box(messageUint8, nonce, this.peerPublicKey, this.keyPair.secretKey);

    return {
      nonce: util.encodeBase64(nonce),
      ciphertext: util.encodeBase64(encrypted),
    };
  }

  // Decrypts an incoming payload from Go
  public decryptMessage(nonceBase64: string, ciphertextBase64: string): any {
    if (!this.peerPublicKey) throw new Error("Peer public key not set!");

    const nonce = util.decodeBase64(nonceBase64);
    const ciphertext = util.decodeBase64(ciphertextBase64);

    const decryptedUint8 = nacl.box.open(
      ciphertext,
      nonce,
      this.peerPublicKey,
      this.keyPair.secretKey,
    );

    if (!decryptedUint8) throw new Error("Decryption failed! Keys or nonce mismatch.");

    const decryptedString = util.encodeUTF8(decryptedUint8);
    return JSON.parse(decryptedString);
  }

  public encryptBytes(messageUint8: Uint8Array): { nonce: string; ciphertext: string } {
    if (!this.peerPublicKey) throw new Error("Peer public key not set!");

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(messageUint8, nonce, this.peerPublicKey, this.keyPair.secretKey);

    return {
      nonce: util.encodeBase64(nonce),
      ciphertext: util.encodeBase64(encrypted),
    };
  }

  // Decrypts raw bytes
  public decryptBytes(nonceBase64: string, ciphertextBase64: string): Uint8Array {
    if (!this.peerPublicKey) throw new Error("Peer public key not set!");

    const nonce = util.decodeBase64(nonceBase64);
    const ciphertext = util.decodeBase64(ciphertextBase64);

    const decryptedUint8 = nacl.box.open(
      ciphertext,
      nonce,
      this.peerPublicKey,
      this.keyPair.secretKey,
    );

    if (!decryptedUint8) throw new Error("Decryption failed! Keys or nonce mismatch.");

    return decryptedUint8;
  }
}
