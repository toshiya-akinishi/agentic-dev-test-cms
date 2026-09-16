/**
 * レスポンスに含める前にユーザードキュメントから機微フィールドを取り除く。
 * `twoFactorSecret` / `twoFactorRecoveryCodes` は overrideAccess: true で読んだ場合
 * フィールドアクセス制御をバイパスするため、内部処理で読んだ値をそのまま返さないようにする。
 */
export const sanitizeUser = <T extends Record<string, unknown>>(user: T): Omit<T, 'twoFactorRecoveryCodes' | 'twoFactorSecret'> => {
  const { twoFactorSecret: _s, twoFactorRecoveryCodes: _r, ...rest } = user
  return rest
}
