import crypto from 'node:crypto';

/**
 * AES-256-GCM encryption for the credentials vault.
 *
 * GCM (not CBC) so every ciphertext is authenticated — a tampered secret fails
 * to decrypt rather than returning garbage. Each secret gets its own random IV.
 *
 * Key rotation: VAULT_MASTER_KEY is version N. Retired keys stay in
 * VAULT_PREVIOUS_KEYS (newest first) so old rows still decrypt; rows are
 * re-encrypted to the current key lazily on update.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV is the GCM standard
const KEY_LENGTH = 32;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function loadKey(raw: string | undefined, label: string): Buffer {
  if (!raw || raw.trim() === '') {
    throw new Error(
      `${label} is not set. Generate one with: openssl rand -base64 32`
    );
  }
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`${label} must decode to exactly 32 bytes (got ${key.length}).`);
  }
  return key;
}

/** All keys, newest first. Index 0 is the current key. */
function keyRing(): Buffer[] {
  const current = loadKey(process.env.VAULT_MASTER_KEY, 'VAULT_MASTER_KEY');
  const previous = (process.env.VAULT_PREVIOUS_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k, i) => loadKey(k, `VAULT_PREVIOUS_KEYS[${i}]`));
  return [current, ...previous];
}

export function currentKeyVersion(): number {
  return keyRing().length;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const keys = keyRing();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keys[0], iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: keys.length,
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const keys = keyRing();
  // keyVersion N was written when the ring had N keys, so it is keys[len - N].
  const index = Math.max(0, keys.length - payload.keyVersion);
  const candidates = [keys[index], ...keys.filter((_, i) => i !== index)];

  let lastError: unknown;
  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    'Unable to decrypt secret with any configured vault key. ' +
      'Check VAULT_MASTER_KEY / VAULT_PREVIOUS_KEYS. ' +
      `Last error: ${(lastError as Error)?.message}`
  );
}

/** Masked preview so the UI can show a secret's shape without revealing it. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return '•'.repeat(Math.max(plaintext.length, 4));
  return `${plaintext.slice(0, 3)}${'•'.repeat(12)}${plaintext.slice(-3)}`;
}

/** URL-safe random token for share links and portal invites. */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Constant-time compare — use for webhook signatures, never `===`. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hmacSha256(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
