import type { Endpoint, PayloadRequest } from 'payload'

import { badRequest, okJson, readJsonBody, unauthorized } from './lib/http'

/**
 * ゲストデータのユーザー移行（要求 6-1 / 補-6-1-1 / T-05-4）
 * POST /api/guest/merge  body: { deviceId: string }
 *
 * `deviceId` に紐づく favorites / likes / notification-settings / device-tokens / inquiries を
 * ログインユーザー（req.user）に付け替える。既に同等のレコードをユーザーが持っている場合は
 * ゲスト側を削除する（重複排除）。
 */

type MergeSpec = {
  /** 重複判定に使うフィールド名。undefined なら重複判定なし（常に付け替え）。
   *  空配列 [] は「1 ユーザー1件」のシングルトン判定として扱う */
  dedupeKeyFields?: string[]
  ownerField: string
  slug: 'device-tokens' | 'favorites' | 'inquiries' | 'likes' | 'notification-settings'
}

const MERGE_SPECS: MergeSpec[] = [
  { slug: 'favorites', ownerField: 'owner', dedupeKeyFields: ['player'] },
  { slug: 'likes', ownerField: 'owner', dedupeKeyFields: ['video', 'shot'] },
  { slug: 'notification-settings', ownerField: 'owner', dedupeKeyFields: [] },
  { slug: 'device-tokens', ownerField: 'owner', dedupeKeyFields: ['token'] },
  { slug: 'inquiries', ownerField: 'submittedBy' }, // 重複判定なし。問い合わせは1件ごとに独立
]

const relId = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === undefined || id === null ? '' : String(id)
  }
  return String(value)
}

const keyOf = (doc: Record<string, unknown>, fields: string[]): string =>
  fields.map((f) => `${f}:${relId(doc[f])}`).join('|')

export const guestMergeEndpoint: Endpoint = {
  path: '/guest/merge',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized('ログインが必要です')

    const body = await readJsonBody<{ deviceId?: unknown }>(req)
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
    if (!deviceId) return badRequest('deviceId は必須です', 'deviceId')

    const userId = req.user.id
    const merged: Record<string, number> = {}
    const skipped: Record<string, number> = {}

    for (const spec of MERGE_SPECS) {
      const guestDocs = await req.payload.find({
        collection: spec.slug,
        where: { deviceId: { equals: deviceId } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })

      let mergedCount = 0
      let skippedCount = 0

      if (guestDocs.docs.length === 0) {
        merged[spec.slug] = 0
        skipped[spec.slug] = 0
        continue
      }

      const ownedKeys = new Set<string>()
      if (spec.dedupeKeyFields) {
        const ownedDocs = await req.payload.find({
          collection: spec.slug,
          where: { [spec.ownerField]: { equals: userId } },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        })
        for (const doc of ownedDocs.docs) {
          ownedKeys.add(keyOf(doc as unknown as Record<string, unknown>, spec.dedupeKeyFields))
        }
      }

      for (const doc of guestDocs.docs) {
        const docId = doc.id as number | string

        if (spec.dedupeKeyFields) {
          const key = keyOf(doc as unknown as Record<string, unknown>, spec.dedupeKeyFields)
          if (ownedKeys.has(key)) {
            // 既にユーザー側に同等のレコードがある → ゲスト側は破棄
            await req.payload.delete({ collection: spec.slug, id: docId, overrideAccess: true })
            skippedCount++
            continue
          }
          ownedKeys.add(key)
        }

        await req.payload.update({
          collection: spec.slug,
          id: docId,
          data: { [spec.ownerField]: userId, deviceId: null },
          overrideAccess: true,
        })
        mergedCount++
      }

      merged[spec.slug] = mergedCount
      skipped[spec.slug] = skippedCount
    }

    return okJson({
      message: 'ゲストデータをユーザーへ移行しました',
      merged,
      skipped,
    })
  },
}
