import type { Endpoint, PayloadRequest } from 'payload'

import { badRequest, okJson, readJsonBody, unauthorized } from './lib/http'
import {
  findRecoveryCodeIndex,
  generateRecoveryCodes,
  hashRecoveryCodes,
} from './lib/recoveryCodes'
import { sanitizeUser } from './lib/sanitizeUser'
import { buildOtpauthUrl, generateTotpSecret, verifyTotpCode } from './lib/totp'

/**
 * 2 段階認証（要求 6-2 / 補-6-2-2 / T-05-6）
 *
 *  - POST /api/auth/2fa/enroll         認証必須。TOTP シークレット + otpauth URL を発行（未確定状態）
 *  - POST /api/auth/2fa/verify         認証必須。コード検証 → 有効化 + リカバリコード 10 個発行
 *  - POST /api/auth/2fa/disable        認証必須。TOTP または リカバリコードで無効化
 *  - POST /api/auth/2fa/login-verify   認証不要（ログインの第2段階）。pendingToken + TOTP コード
 *  - POST /api/auth/2fa/login-recovery 認証不要（ログインの第2段階）。pendingToken + リカバリコード
 */

type UsersDoc = {
  email?: string
  id: number | string
  twoFactorEnabled?: boolean
  twoFactorRecoveryCodes?: unknown
  twoFactorSecret?: string
}

/** overrideAccess で twoFactorSecret / twoFactorRecoveryCodes を含む生ドキュメントを取得する */
const loadFullUser = async (req: PayloadRequest, id: number | string): Promise<UsersDoc> => {
  const doc = await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    overrideAccess: true,
  })
  return doc as unknown as UsersDoc
}

/** `pendingToken`（Payload が /api/users/login で発行した本物の JWT）を検証してユーザーを取得する */
const authenticateWithToken = async (
  req: PayloadRequest,
  pendingToken: string,
): Promise<UsersDoc | null> => {
  if (!pendingToken) return null
  try {
    const headers = new Headers({ Authorization: `JWT ${pendingToken}` })
    const { user } = await req.payload.auth({ headers, req: req as never })
    if (!user || user.collection !== 'users') return null
    // auth() はフィールドアクセス制御ありで読むため twoFactorSecret 等が欠落している。
    // 生の値が必要なので overrideAccess で読み直す
    return await loadFullUser(req, user.id)
  } catch {
    return null
  }
}

/** 検証済みの JWT からペイロード（exp を含む）を取り出す。署名検証は payload.auth() 側で完了済み */
const decodeJwtExp = (token: string): number | undefined => {
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return undefined
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as { exp?: number }
    return parsed.exp
  } catch {
    return undefined
  }
}

export const twoFactorEnrollEndpoint: Endpoint = {
  path: '/auth/2fa/enroll',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized()

    const secret = generateTotpSecret()
    const accountLabel = req.user.email ?? String(req.user.id)
    const otpauthUrl = buildOtpauthUrl(secret, accountLabel)

    // 未確定（pending）状態: twoFactorSecret は設定するが twoFactorEnabled は false のまま。
    // /verify が成功するまで有効化されない
    await req.payload.update({
      collection: 'users',
      id: req.user.id,
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
      },
      overrideAccess: true,
    })

    return okJson({ secret, otpauthUrl })
  },
}

export const twoFactorVerifyEndpoint: Endpoint = {
  path: '/auth/2fa/verify',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized()

    const body = await readJsonBody<{ code?: unknown }>(req)
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) return badRequest('code は必須です', 'code')

    const fullUser = await loadFullUser(req, req.user.id)
    if (!fullUser.twoFactorSecret) {
      return badRequest('先に /api/auth/2fa/enroll でシークレットを発行してください')
    }

    const valid = await verifyTotpCode(fullUser.twoFactorSecret, code)
    if (!valid) return badRequest('コードが正しくありません', 'code')

    const recoveryCodes = generateRecoveryCodes(10)
    const hashed = hashRecoveryCodes(recoveryCodes)

    await req.payload.update({
      collection: 'users',
      id: req.user.id,
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: hashed,
      },
      overrideAccess: true,
    })

    // リカバリコードは平文でこの応答でのみ返す（再表示不可）
    return okJson({ recoveryCodes })
  },
}

export const twoFactorDisableEndpoint: Endpoint = {
  path: '/auth/2fa/disable',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized()

    const body = await readJsonBody<{ code?: unknown }>(req)
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) return badRequest('code は必須です', 'code')

    const fullUser = await loadFullUser(req, req.user.id)
    if (!fullUser.twoFactorEnabled) {
      return badRequest('2段階認証は有効化されていません')
    }

    let valid = false
    if (fullUser.twoFactorSecret) {
      valid = await verifyTotpCode(fullUser.twoFactorSecret, code)
    }
    if (!valid && Array.isArray(fullUser.twoFactorRecoveryCodes)) {
      valid = findRecoveryCodeIndex(fullUser.twoFactorRecoveryCodes, code) >= 0
    }
    if (!valid) return badRequest('コードが正しくありません', 'code')

    await req.payload.update({
      collection: 'users',
      id: req.user.id,
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      },
      overrideAccess: true,
    })

    return okJson({ message: '2段階認証を無効化しました' })
  },
}

export const twoFactorLoginVerifyEndpoint: Endpoint = {
  path: '/auth/2fa/login-verify',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const body = await readJsonBody<{ code?: unknown; pendingToken?: unknown }>(req)
    const pendingToken = typeof body.pendingToken === 'string' ? body.pendingToken : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!pendingToken || !code) return badRequest('pendingToken と code は必須です')

    const user = await authenticateWithToken(req, pendingToken)
    if (!user) return unauthorized('pendingToken が無効です')
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return badRequest('2段階認証は有効化されていません')
    }

    const valid = await verifyTotpCode(user.twoFactorSecret, code)
    if (!valid) return badRequest('コードが正しくありません', 'code')

    const exp = decodeJwtExp(pendingToken)
    const sessionUser = await req.payload.findByID({ collection: 'users', id: user.id, depth: 0 })

    return okJson({ user: sanitizeUser(sessionUser as unknown as Record<string, unknown>), token: pendingToken, exp })
  },
}

export const twoFactorLoginRecoveryEndpoint: Endpoint = {
  path: '/auth/2fa/login-recovery',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const body = await readJsonBody<{ pendingToken?: unknown; recoveryCode?: unknown }>(req)
    const pendingToken = typeof body.pendingToken === 'string' ? body.pendingToken : ''
    const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : ''
    if (!pendingToken || !recoveryCode) {
      return badRequest('pendingToken と recoveryCode は必須です')
    }

    const user = await authenticateWithToken(req, pendingToken)
    if (!user) return unauthorized('pendingToken が無効です')
    if (!user.twoFactorEnabled) {
      return badRequest('2段階認証は有効化されていません')
    }

    const codes = Array.isArray(user.twoFactorRecoveryCodes) ? user.twoFactorRecoveryCodes : []
    const idx = findRecoveryCodeIndex(codes, recoveryCode)
    if (idx < 0) return badRequest('リカバリコードが正しくありません', 'recoveryCode')

    // 使用済みコードを消費（削除）する
    const remaining = (codes as unknown[]).filter((_, i) => i !== idx)
    await req.payload.update({
      collection: 'users',
      id: user.id,
      data: { twoFactorRecoveryCodes: remaining },
      overrideAccess: true,
    })

    const exp = decodeJwtExp(pendingToken)
    const sessionUser = await req.payload.findByID({ collection: 'users', id: user.id, depth: 0 })

    return okJson({ user: sanitizeUser(sessionUser as unknown as Record<string, unknown>), token: pendingToken, exp })
  },
}

export const twoFactorEndpoints: Endpoint[] = [
  twoFactorEnrollEndpoint,
  twoFactorVerifyEndpoint,
  twoFactorDisableEndpoint,
  twoFactorLoginVerifyEndpoint,
  twoFactorLoginRecoveryEndpoint,
]
