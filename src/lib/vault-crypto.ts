import "server-only";

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * AES-256-GCM for vault secrets, so the database never holds a plaintext
 * credential — a table leak on its own reveals nothing without this key.
 *
 * `VAULT_ENCRYPTION_KEY` is a 32-byte key, base64-encoded (generate with
 * `openssl rand -base64 32`). It lives only in the server environment, never
 * shipped to the client, and is unrelated to any Supabase key — losing it
 * makes every stored secret permanently unrecoverable, so back it up
 * somewhere durable before this feature holds anything real.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "VAULT_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "VAULT_ENCRYPTION_KEY must decode to exactly 32 bytes — generate with: openssl rand -base64 32"
    );
  }
  return key;
}

/** Encrypts a secret for storage. Stored as `iv.ciphertext.authTag`, each base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, ciphertext, authTag].map((buf) => buf.toString("base64")).join(".");
}

/**
 * Reverses encryptSecret. Throws if the stored value is malformed, was
 * tampered with, or the key doesn't match — GCM's auth tag catches all three,
 * which is the point of an authenticated cipher over a plain one.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed vault secret");
  }
  const [ivB64, ciphertextB64, authTagB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
