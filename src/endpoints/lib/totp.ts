/**
 * TOTP（RFC 6238）ヘルパー。6-2 / 補-6-2-2。
 * `otplib`（v13, functional API）を使用。デフォルトの crypto / base32 プラグイン
 * （NobleCryptoPlugin / ScureBase32Plugin）で標準的な認証アプリ（Google Authenticator 等）と互換。
 */
import { createGuardrails, generateSecret, generateURI, verify as otpVerify } from 'otplib'

export const TOTP_ISSUER = 'J-Tour Fan App'

/**
 * otplib v13 のデフォルト guardrails は MIN_SECRET_BYTES=16 だが、
 * RFC 4226 の古典的なテストシークレット（10 バイト。例: seed 用ダミー
 * `JBSWY3DPEHPK3PXP` = src/seed/users.ts の fan2）等、既存の短いシークレットも
 * 検証できるよう緩和する（自前で発行するシークレットは generateSecret() により
 * 常に 20 バイトなので、この緩和が新規発行の安全性を下げることはない）。
 */
const VERIFY_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 8 })

/** Base32 エンコードされたランダムシークレットを生成する */
export const generateTotpSecret = (): string => generateSecret()

/** 認証アプリの QR 表示用 otpauth:// URI */
export const buildOtpauthUrl = (secret: string, accountLabel: string): string =>
  generateURI({ issuer: TOTP_ISSUER, label: accountLabel, secret })

/**
 * TOTP 6 桁コードを検証する。前後 30 秒（1 ステップ）の揺れを許容する。
 */
export const verifyTotpCode = async (secret: string, token: string): Promise<boolean> => {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return false
  try {
    const result = await otpVerify({ secret, token, epochTolerance: 30, guardrails: VERIFY_GUARDRAILS })
    return Boolean(result?.valid)
  } catch {
    return false
  }
}
