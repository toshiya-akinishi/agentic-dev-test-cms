import { getFieldsToSign, jwtSign } from 'payload'
import type { CollectionConfig, PayloadRequest } from 'payload'

/**
 * Payload の `useSessions`（auth のデフォルト。src/collections/Users.ts では明示的に無効化していない）
 * 環境では、JWT に有効な `sid` が含まれ、かつ users.sessions 配列に一致するセッションが
 * 存在しないと `payload.auth()` / JWT 戦略の検証が通らない
 * （node_modules/payload/dist/auth/strategies/jwt.js 参照）。
 *
 * `payload.login()` はメール＋パスワードが要る（MOCK の SNS ログインでは既存ユーザーの平文
 * パスワードを持っていない）ため、ここでは `payload.login()` 内部の
 * `addSessionToUser` 相当の処理を local API で再現し、有効なセッション付き JWT を発行する。
 */
export type IssuedSession = { exp: number; token: string }

type SessionEntry = { createdAt: string; expiresAt: string; id: string }

export const issueSessionToken = async (
  req: PayloadRequest,
  userId: number | string,
): Promise<IssuedSession> => {
  const usersCollection = req.payload.collections['users']
  if (!usersCollection) throw new Error('users collection is not configured')
  const collectionConfig: CollectionConfig = usersCollection.config
  const tokenExpiration =
    typeof collectionConfig.auth === 'object' ? (collectionConfig.auth.tokenExpiration ?? 7200) : 7200

  const fullUser = await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })

  const now = new Date()
  const sid = crypto.randomUUID()
  const expiresAt = new Date(now.getTime() + tokenExpiration * 1000)
  const existingSessions = Array.isArray((fullUser as { sessions?: SessionEntry[] }).sessions)
    ? (fullUser as { sessions: SessionEntry[] }).sessions
    : []
  const nonExpired = existingSessions.filter((s) => new Date(s.expiresAt) > now)
  const sessions = [...nonExpired, { id: sid, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }]

  await req.payload.update({
    collection: 'users',
    id: userId,
    data: { sessions },
    overrideAccess: true,
  })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: (fullUser as { email?: string }).email ?? '',
    sid,
    user: fullUser as unknown as PayloadRequest['user'],
  })

  const { exp, token } = await jwtSign({
    fieldsToSign,
    secret: req.payload.secret,
    tokenExpiration,
  })

  return { exp, token }
}
