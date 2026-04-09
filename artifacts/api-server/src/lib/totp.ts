import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";

const APP_NAME = "Halal Tech ERP";

/* ── AES-256-CBC encryption key for TOTP secrets ─────────────
   Prefer TOTP_ENCRYPTION_KEY env var (exactly 32 chars).
   Falls back to a deterministic 32-byte key derived from JWT_SECRET.
─────────────────────────────────────────────────────────────── */
const ENCRYPTION_KEY: string =
  process.env.TOTP_ENCRYPTION_KEY?.slice(0, 32).padEnd(32, "0") ??
  crypto.createHash("sha256").update(process.env.JWT_SECRET ?? "default-key").digest("hex").slice(0, 32);

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptSecret(encryptedSecret: string): string {
  const [ivHex, encrypted] = encryptedSecret.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Returns true if the value looks like an AES-encrypted secret (hex:hex) */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

export function generateTOTPSecret(username: string) {
  const secret = speakeasy.generateSecret({
    name:   `${APP_NAME} (${username})`,
    issuer: APP_NAME,
    length: 32,
  });
  return {
    secret:       secret.base32,
    otpauth_url:  secret.otpauth_url!,
  };
}

export async function generateQRCode(otpauth_url: string): Promise<string> {
  return QRCode.toDataURL(otpauth_url);
}

export function verifyTOTP(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2,
  });
}
