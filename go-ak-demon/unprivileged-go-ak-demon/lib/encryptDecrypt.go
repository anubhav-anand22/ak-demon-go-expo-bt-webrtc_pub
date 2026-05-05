package lib

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"

	"golang.org/x/crypto/nacl/box"
)

type CryptoHandler struct {
	publicKey  *[32]byte
	privateKey *[32]byte
	peerPubKey *[32]byte
}

func NewCryptoHandler() (*CryptoHandler, error) {
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &CryptoHandler{publicKey: pub, privateKey: priv}, nil
}

func (c *CryptoHandler) GetMyPublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(c.publicKey[:])
}

func (c *CryptoHandler) SetPeerPublicKey(base64Key string) error {
	decoded, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil || len(decoded) != 32 {
		return fmt.Errorf("invalid peer public key")
	}
	var pubKey [32]byte
	copy(pubKey[:], decoded)
	c.peerPubKey = &pubKey
	return nil
}

func (c *CryptoHandler) IsReady() bool {
	return c.peerPubKey != nil
}

// EncryptedPayload represents what gets sent over WebRTC
type EncryptedPayload struct {
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

func (c *CryptoHandler) EncryptMessage(msg interface{}) (*EncryptedPayload, error) {
	if c.peerPubKey == nil {
		return nil, fmt.Errorf("peer public key not set")
	}

	jsonBytes, _ := json.Marshal(msg)

	// Generate 24-byte nonce
	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return nil, err
	}

	// Encrypt
	encrypted := box.Seal(nil, jsonBytes, &nonce, c.peerPubKey, c.privateKey)

	return &EncryptedPayload{
		Nonce:      base64.StdEncoding.EncodeToString(nonce[:]),
		Ciphertext: base64.StdEncoding.EncodeToString(encrypted),
	}, nil
}

func (c *CryptoHandler) DecryptMessage(payload EncryptedPayload) ([]byte, error) {
	if c.peerPubKey == nil {
		return nil, fmt.Errorf("peer public key not set")
	}

	nonceBytes, _ := base64.StdEncoding.DecodeString(payload.Nonce)
	cipherBytes, _ := base64.StdEncoding.DecodeString(payload.Ciphertext)

	var nonce [24]byte
	copy(nonce[:], nonceBytes)

	decrypted, ok := box.Open(nil, cipherBytes, &nonce, c.peerPubKey, c.privateKey)
	if !ok {
		return nil, fmt.Errorf("decryption failed")
	}

	return decrypted, nil
}

func (c *CryptoHandler) EncryptBytes(data []byte) (*EncryptedPayload, error) {
	if c.peerPubKey == nil {
		return nil, fmt.Errorf("peer public key not set")
	}

	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return nil, err
	}

	encrypted := box.Seal(nil, data, &nonce, c.peerPubKey, c.privateKey)

	return &EncryptedPayload{
		Nonce:      base64.StdEncoding.EncodeToString(nonce[:]),
		Ciphertext: base64.StdEncoding.EncodeToString(encrypted),
	}, nil
}

func (c *CryptoHandler) DecryptBytes(nonceBase64 string, ciphertextBase64 string) ([]byte, error) {
	if c.peerPubKey == nil {
		return nil, fmt.Errorf("peer public key not set")
	}

	nonceBytes, err := base64.StdEncoding.DecodeString(nonceBase64)
	if err != nil || len(nonceBytes) != 24 {
		return nil, fmt.Errorf("invalid nonce")
	}
	cipherBytes, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return nil, fmt.Errorf("invalid ciphertext base64")
	}

	var nonce [24]byte
	copy(nonce[:], nonceBytes)

	decrypted, ok := box.Open(nil, cipherBytes, &nonce, c.peerPubKey, c.privateKey)
	if !ok {
		return nil, fmt.Errorf("decryption failed")
	}

	return decrypted, nil
}
