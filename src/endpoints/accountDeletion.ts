import type { Endpoint, PayloadRequest } from 'payload'

import { badRequest, okJson, readJsonBody, unauthorized } from './lib/http'

/**
 * 退会（要求 6-7 / 補-6-7-1, 補-6-7-2 / T-05-9）
 * POST /api/users/me/delete   body: { password: string }
 *
 * パスワード確認 → 論理削除（`deletedAt` + メールを `deleted+<id>@jtour.invalid` にリネーム）→
 * favorites / likes / playlists / notification-settings / device-tokens を物理削除 →
 * ticket-orders / analytics-events は匿名化（PII クリアのみ、レコード自体は残す）。
 *
 * 重要: この Endpoint は `Users`（src/collections/Users.ts）自身の `endpoints` 配列に登録する。
 * ルートレベルの `config.endpoints` に置くと、先頭セグメント `users` が先にコレクションスラッグとして
 * 解決され、users コレクション標準の endpoints（`/:id` 等）にルーティングが奪われてしまう
 * （node_modules/payload/dist/utilities/handleEndpoints.js 参照）。そのため相対パス
 * `/me/delete` として登録する。
 */

const HARD_DELETE_COLLECTIONS = [
  'favorites',
  'likes',
  'playlists',
  'notification-settings',
  'device-tokens',
] as const

export const accountDeletionEndpoint: Endpoint = {
  // Users コレクションの endpoints に登録するため相対パス（/api/users + /me/delete）
  path: '/me/delete',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized()

    const body = await readJsonBody<{ password?: unknown }>(req)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!password) return badRequest('password は必須です', 'password')

    const userId = req.user.id
    const email = req.user.email as string

    // パスワード確認: Payload local API の login を使い、成功可否のみを利用する
    // （成功時に新しく発行される token はここでは破棄する）
    try {
      await req.payload.login({
        collection: 'users',
        data: { email, password },
        req: req as never,
      })
    } catch {
      return badRequest('パスワードが正しくありません', 'password')
    }

    // 1. 関連データを物理削除（補-6-7-2）
    for (const slug of HARD_DELETE_COLLECTIONS) {
      const docs = await req.payload.find({
        collection: slug,
        where: { owner: { equals: userId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of docs.docs) {
        await req.payload.delete({ collection: slug, id: doc.id, overrideAccess: true })
      }
    }

    // 2. ticket-orders は匿名化（レコードは残す。補-6-7-2）
    //    user 参照はそのまま残る（集計・監査目的）が、ユーザー側は論理削除済みで個人特定情報は
    //    users ドキュメント側の匿名化で担保する。加えて QR ペイロードのような再利用可能情報は無効化する
    const ticketOrders = await req.payload.find({
      collection: 'ticket-orders',
      where: { user: { equals: userId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const order of ticketOrders.docs) {
      await req.payload.update({
        collection: 'ticket-orders',
        id: order.id,
        data: { qrPayload: null },
        overrideAccess: true,
      })
    }

    // 3. analytics-events は匿名化（userId をクリア。集計に使う値は保持。補-6-7-2）
    const events = await req.payload.find({
      collection: 'analytics-events',
      where: { userId: { equals: userId } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
    for (const ev of events.docs) {
      await req.payload.update({
        collection: 'analytics-events',
        id: ev.id,
        data: { userId: null },
        overrideAccess: true,
      })
    }

    // 4. ユーザー本体を論理削除（補-6-7-1）
    await req.payload.update({
      collection: 'users',
      id: userId,
      data: {
        deletedAt: new Date().toISOString(),
        email: `deleted+${userId}@jtour.invalid`,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      },
      overrideAccess: true,
    })

    return okJson({ message: '退会処理が完了しました' })
  },
}
