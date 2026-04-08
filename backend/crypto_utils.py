import base64
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.fernet import Fernet

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derives a Fernet-compatible key from a passphrase and salt using PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))
    return key

def encrypt_data(data: str, passphrase: str) -> bytes:
    """
    Encrypts generic string data using AES-256 (Fernet).
    Structure: [SALT(16 bytes)][ENCRYPTED_PAYLOAD]
    """
    salt = os.urandom(16)
    key = derive_key(passphrase, salt)
    f = Fernet(key)
    encrypted_payload = f.encrypt(data.encode())
    return salt + encrypted_payload

def decrypt_data(encrypted_blob: bytes, passphrase: str) -> str:
    """Decrypts a blob using the passphrase."""
    try:
        salt = encrypted_blob[:16]
        payload = encrypted_blob[16:]
        key = derive_key(passphrase, salt)
        f = Fernet(key)
        return f.decrypt(payload).decode()
    except Exception as e:
        print(f"[!] Decryption Failed: {e}")
        return None
