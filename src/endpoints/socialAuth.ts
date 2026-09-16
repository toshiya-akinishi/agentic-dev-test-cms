import type { Endpoint, PayloadRequest } from 'payload'

import { badRequest, okJson, readJsonBody, unauthorized } from './lib/http'
import { issueSessionToken } from './lib/issueSession'
import { sanitizeUser } from './lib/sanitizeUser'
import type { User } from '../payload-types'

/**
 * SNS 連携（MOCK）（要求 6-4 / 補-6-4-1 / T-05-6）
 * POST /api/auth/social/:provider   provider = google | apple | line
 *
 * 実際の OAuth 認可は行わない（MOCK）。
 *  - mode=login: fakeEmail で find-or-create → 本物の Payload JWT を発行してログインさせる
 *  - mode=link : （認証必須）ログイン中ユーザーの snsAccounts に連携情報を記録する
 */

const PROVIDERS = ['google', 'apple', 'line'] as const
type Provider = (typeof PROVIDERS)[number]

const isProvider = (value: unknown): value is Provider =>
  typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)

const randomPassword = (): string => {
  // SNS ログインのユーザーは通常パスワードでログインしないため、推測不能な値で埋めておく
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!'
}

export const socialAuthEndpoint: Endpoint = {
  path: '/auth/social/:provider',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const provider = req.routeParams?.provider
    if (!isProvider(provider)) {
      return badRequest('provider は google / apple / line のいずれかを指定してください', 'provider')
    }

    const body = await readJsonBody<{
      fakeEmail?: unknown
      fakeName?: unknown
      mode?: unknown
    }>(req)
    const mode = body.mode === 'link' ? 'link' : body.mode === 'login' ? 'login' : undefined
    const fakeEmail = typeof body.fakeEmail === 'string' ? body.fakeEmail.trim().toLowerCase() : ''
    const fakeName = typeof body.fakeName === 'string' ? body.fakeName.trim() : undefined

    if (!mode) return badRequest('mode は login / link のいずれかを指定してください', 'mode')
    if (!fakeEmail) return badRequest('fakeEmail は必須です', 'fakeEmail')

    if (mode === 'link') {
      if (!req.user) return unauthorized('連携にはログインが必要です')

      const existing = await req.payload.findByID({
        collection: 'users',
        id: req.user.id,
        depth: 0,
        overrideAccess: true,
      })
      const snsAccounts = Array.isArray((existing as { snsAccounts?: unknown[] }).snsAccounts)
        ? [...((existing as { snsAccounts: unknown[] }).snsAccounts as Record<string, unknown>[])]
        : []

      const idx = snsAccounts.findIndex((a) => a?.provider === provider)
      const entry = { provider, accountId: fakeEmail, linkedAt: new Date().toISOString() }
      if (idx >= 0) snsAccounts[idx] = entry
      else snsAccounts.push(entry)

      const updated = await req.payload.update({
        collection: 'users',
        id: req.user.id,
        data: { snsAccounts },
        overrideAccess: true,
      })

      return okJson({
        user: sanitizeUser(updated as unknown as Record<string, unknown>),
        message: `${provider} と連携しました`,
      })
    }

    // mode === 'login': find-or-create → 本物の JWT を発行（MOCK: 認可フローはスタブ）
    const found = await req.payload.find({
      collection: 'users',
      where: { email: { equals: fakeEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    let user: User | undefined = found.docs[0] as User | undefined

    if (!user) {
      user = (await req.payload.create({
        collection: 'users',
        data: {
          email: fakeEmail,
          password: randomPassword(),
          role: 'fan',
          displayName: fakeName || fakeEmail.split('@')[0],
          onboardingCompleted: false,
          notificationMaster: true,
          snsAccounts: [{ provider, accountId: fakeEmail, linkedAt: new Date().toISOString() }],
        },
        overrideAccess: true,
        depth: 0,
      })) as unknown as User
    } else if (user.deletedAt) {
      return unauthorized('このアカウントは退会済みです')
    }

    // useSessions（デフォルト有効）下では sid 付きの JWT + users.sessions への登録が必須
    // （そうしないと後続リクエストの認証が通らない）。payload.login() はパスワードが要るため
    // 使えず、addSessionToUser 相当の処理を local API で再現する
    const { exp, token } = await issueSessionToken(req, user.id)

    const fullUser = await req.payload.findByID({ collection: 'users', id: user.id as number, depth: 0 })

    return okJson({ user: sanitizeUser(fullUser as unknown as Record<string, unknown>), token, exp })
  },
}
