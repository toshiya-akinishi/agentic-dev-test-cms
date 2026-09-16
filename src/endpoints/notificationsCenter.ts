import type { Endpoint, PayloadRequest, Where } from 'payload'

import { deviceIdOf } from '../access'
import { badRequest, okJson, readJsonBody, unauthorized } from './lib/http'

/**
 * 通知センター（要求 6-17 / 補-6-17-1〜3 / T-14-11）
 *
 * GET  /api/notifications/me         — 新着順一覧・既読/未読・未読バッジ数・緊急通知ピン留め
 * POST /api/notifications/mark-read  — 既読化
 *
 * 宛先の識別: ログインユーザーは req.user、ゲストは `X-Device-Id` ヘッダ（または
 * `?deviceId=`）で識別する（補-6-1-1 と同じ規約 / access/roles.ts の deviceIdOf を再利用）。
 *
 * 保持期間 30 日（補-6-17-3）: バッチ削除ジョブは実装しない（SIMPL）。この検証環境には
 * cron が無く、`notifications` は 6-17 の受け入れ基準を満たせば十分と判断し、
 * 一覧取得時に `sentAt >= 30日前` でフィルタするだけに留める（データそのものは残るため、
 * 実運用移行時に定期削除ジョブを追加すれば挙動は変わらない）。
 *
 * 既読管理の制約（SIMPL・既知の制限として明記）: `notifications.readBy` は users への
 * リレーションのみを持つ（コレクション定義は EP-02 で確定済み）。そのためゲスト
 * （deviceId のみ）の既読状態はこの実装では永続化できない。ゲストの一覧は常に
 * 「未読」として返す（バッジ数に影響）。ログイン済みユーザーは readBy で正しく管理される。
 */

type NotificationDoc = {
  id: number
  type: string
  title: string
  body: string
  deepLink?: string | null
  tournament?: unknown
  player?: unknown
  audience: 'all' | 'user' | 'device'
  targetUser?: unknown
  targetDeviceId?: string | null
  sentAt: string
  priority?: string | null
  readBy?: unknown[] | null
}

const RETENTION_DAYS = 30

const relId = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
  }
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
}

type Identity = { kind: 'user'; userId: number } | { kind: 'device'; deviceId: string }

const identityOf = (req: PayloadRequest): Identity | undefined => {
  if (req.user?.id) return { kind: 'user', userId: req.user.id as number }
  const deviceId = deviceIdOf(req as never)
  if (deviceId) return { kind: 'device', deviceId }
  return undefined
}

const matchesIdentity = (doc: NotificationDoc, identity: Identity): boolean => {
  if (doc.audience === 'all') return true
  if (doc.audience === 'user' && identity.kind === 'user') return relId(doc.targetUser) === identity.userId
  if (doc.audience === 'device' && identity.kind === 'device') return doc.targetDeviceId === identity.deviceId
  return false
}

const isReadBy = (doc: NotificationDoc, identity: Identity): boolean => {
  // 既知の制限: ゲスト（deviceId）の既読はサーバー側で管理できない（上記コメント参照）
  if (identity.kind === 'device') return false
  const readers = (doc.readBy ?? []).map((r) => relId(r))
  return readers.includes(identity.userId)
}

export const notificationsMeEndpoint: Endpoint = {
  path: '/me',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const identity = identityOf(req)
    if (!identity) {
      return unauthorized('ログインするか、X-Device-Id ヘッダ（またはdeviceIdクエリ）を指定してください')
    }

    const query = req.query as Record<string, unknown>
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
    const page = Math.max(1, Number(query.page ?? 1) || 1)
    const unreadOnly = query.unreadOnly === 'true' || query.unreadOnly === true

    const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // audience=all は全員宛のため、そのまま OR 条件に含める。
    const where: Where = {
      and: [
        { sentAt: { greater_than_equal: retentionCutoff } },
        {
          or: [
            { audience: { equals: 'all' } },
            identity.kind === 'user'
              ? { and: [{ audience: { equals: 'user' } }, { targetUser: { equals: identity.userId } }] }
              : { and: [{ audience: { equals: 'device' } }, { targetDeviceId: { equals: identity.deviceId } }] },
          ],
        },
      ],
    }

    const res = await req.payload.find({
      collection: 'notifications',
      where,
      sort: '-sentAt',
      limit: 500, // 取得後にピン留め順へ並べ替えるため広めに取得する（検証環境の規模を前提とした簡易実装）
      depth: 1,
      overrideAccess: true,
    })
    const docs = (res.docs as unknown as NotificationDoc[]).filter((d) => matchesIdentity(d, identity))

    const withMeta = docs.map((d) => {
      const read = isReadBy(d, identity)
      const pinned = d.type === 'emergency' && !read // 補-6-17-3: 緊急通知は未読の間、最上位にピン留め
      return { doc: d, read, pinned }
    })

    withMeta.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.doc.sentAt).getTime() - new Date(a.doc.sentAt).getTime()
    })

    const unreadCount = withMeta.filter((m) => !m.read).length
    const total = withMeta.length
    const start = (page - 1) * limit
    const pageItems = (unreadOnly ? withMeta.filter((m) => !m.read) : withMeta).slice(start, start + limit)

    return okJson({
      identity: identity.kind === 'user' ? { type: 'user', userId: identity.userId } : { type: 'device', deviceId: identity.deviceId },
      unreadCount,
      total: unreadOnly ? withMeta.filter((m) => !m.read).length : total,
      page,
      limit,
      notifications: pageItems.map(({ doc, read, pinned }) => ({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        body: doc.body,
        deepLink: doc.deepLink ?? null,
        tournament: doc.tournament ?? null,
        player: doc.player ?? null,
        priority: doc.priority ?? 'normal',
        sentAt: doc.sentAt,
        read,
        pinned,
      })),
    })
  },
}

type MarkReadBody = { id?: unknown; ids?: unknown; all?: unknown }

export const notificationsMarkReadEndpoint: Endpoint = {
  path: '/mark-read',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const identity = identityOf(req)
    if (!identity) {
      return unauthorized('ログインするか、X-Device-Id ヘッダ（またはdeviceIdクエリ）を指定してください')
    }
    if (identity.kind === 'device') {
      // 上記の既知の制限: readBy は users のみを参照できるため、ゲストの既読化は永続化できない。
      return okJson({
        message: 'ゲスト（未ログイン）の既読状態はサーバー側では保持できません（アプリ側でローカル管理してください）',
        markedRead: 0,
      })
    }

    const body = await readJsonBody<MarkReadBody>(req)
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : typeof body.id === 'number' || typeof body.id === 'string'
        ? [Number(body.id)]
        : []
    const markAll = body.all === true

    if (!markAll && ids.length === 0) return badRequest('id / ids / all のいずれかを指定してください')

    const where: Where = markAll
      ? { or: [{ audience: { equals: 'all' } }, { and: [{ audience: { equals: 'user' } }, { targetUser: { equals: identity.userId } }] }] }
      : { id: { in: ids } }

    const res = await req.payload.find({
      collection: 'notifications',
      where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })

    let markedRead = 0
    for (const doc of res.docs as unknown as NotificationDoc[]) {
      const readers = (doc.readBy ?? []).map((r) => relId(r)).filter((v): v is number => v !== undefined)
      if (readers.includes(identity.userId)) continue // 既に既読
      await req.payload.update({
        collection: 'notifications',
        id: doc.id,
        data: { readBy: [...readers, identity.userId] },
        overrideAccess: true,
      })
      markedRead++
    }

    return okJson({ message: `${markedRead} 件を既読にしました`, markedRead })
  },
}
