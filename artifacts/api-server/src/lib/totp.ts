import speakeasy from "speakeasy";
import QRCode from "qrcode";

const APP_NAME = "Halal Tech ERP";

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
