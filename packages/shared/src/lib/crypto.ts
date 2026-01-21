import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// AES-256-GCM encryption for storing secrets in the database
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get the encryption key from environment variable.
 * Must be a 32-byte (256-bit) key for AES-256.
 * Falls back to a default key in development/test environments.
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // In development/test, use a default key (32 bytes = 256 bits)
    // This should NEVER be used in production
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }
    return "dev-encryption-key-32-bytes-!!";
  }
  return key;
}

/**
 * Get the SSO encryption key from environment variable.
 * Falls back to ENCRYPTION_KEY for backwards compatibility.
 */
function getSsoEncryptionKey(): string {
  const key =
    process.env.UNI_STATUS_SSO_ENCRYPTION_KEY ||
    process.env.SSO_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("UNI_STATUS_SSO_ENCRYPTION_KEY environment variable is not set");
    }
    return "dev-encryption-key-32-bytes-!!";
  }
  return key;
}

/**
 * Derive a key from the master key and salt using scrypt.
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
}

async function encryptWithKey(plaintext: string, masterKey: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(masterKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Combine salt, iv, tag, and ciphertext into a single buffer
  const combined = Buffer.concat([salt, iv, tag, encrypted]);

  // Return as base64 with a prefix to identify encrypted values
  return `enc:${combined.toString("base64")}`;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing salt:iv:tag:ciphertext
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }
  return encryptWithKey(plaintext, getEncryptionKey());
}

async function decryptWithKey(ciphertext: string, masterKey: string): Promise<string> {
  if (!ciphertext) {
    return ciphertext;
  }

  // Check for encryption prefix
  if (!ciphertext.startsWith("enc:")) {
    // Not encrypted, return as-is (for backwards compatibility)
    return ciphertext;
  }

  // Remove prefix and decode
  const combined = Buffer.from(ciphertext.slice(4), "base64");

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  // Derive key from master key and salt
  const key = await deriveKey(masterKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Decrypt a ciphertext string that was encrypted with encrypt().
 * Expects base64 string with enc: prefix containing salt:iv:tag:ciphertext
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  return decryptWithKey(ciphertext, getEncryptionKey());
}

export async function encryptSsoSecret(plaintext: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }
  return encryptWithKey(plaintext, getSsoEncryptionKey());
}

export async function decryptSsoSecret(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  return decryptWithKey(ciphertext, getSsoEncryptionKey());
}

/**
 * Check if a value is encrypted (has the enc: prefix)
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith("enc:") ?? false;
}

/**
 * Encrypt sensitive fields in a config object.
 * Looks for fields named 'password', 'secret', 'apiKey', 'token' and encrypts them.
 */
export async function encryptConfigSecrets<T extends Record<string, unknown>>(
  config: T
): Promise<T> {
  const sensitiveFields = ["password", "secret", "apiKey", "token", "accessToken", "secretKey", "signingKey", "authToken", "apiSecret", "accessSecret"];
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && sensitiveFields.includes(key) && !isEncrypted(value)) {
      (result as Record<string, unknown>)[key] = await encrypt(value);
    } else if (Array.isArray(value)) {
      // Preserve arrays as-is (don't recurse into them as objects)
      (result as Record<string, unknown>)[key] = value;
    } else if (typeof value === "object" && value !== null) {
      (result as Record<string, unknown>)[key] = await encryptConfigSecrets(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in a config object.
 * Looks for fields named 'password', 'secret', 'apiKey', 'token' and decrypts them.
 */
export async function decryptConfigSecrets<T extends Record<string, unknown>>(
  config: T
): Promise<T> {
  const sensitiveFields = ["password", "secret", "apiKey", "token", "accessToken", "secretKey", "signingKey", "authToken", "apiSecret", "accessSecret"];
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && sensitiveFields.includes(key) && isEncrypted(value)) {
      (result as Record<string, unknown>)[key] = await decrypt(value);
    } else if (Array.isArray(value)) {
      // Preserve arrays as-is (don't recurse into them as objects)
      (result as Record<string, unknown>)[key] = value;
    } else if (typeof value === "object" && value !== null) {
      (result as Record<string, unknown>)[key] = await decryptConfigSecrets(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}
