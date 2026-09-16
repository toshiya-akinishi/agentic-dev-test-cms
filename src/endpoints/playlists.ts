import type { Endpoint, PayloadRequest, Where } from 'payload'

import { isStaff } from '../access'
import { badRequest, okJson } from './lib/http'

/**
 * 自動生成プレイリスト（要求 2-15 / 補-2-15-1 / 補-2-15-2）
 * GET /api/playlists/auto?roundId=&playerId=
 *
 * 指定した「ラウンド × 選手」の当日のショット動画（kind=shot）を
 * hole 昇順 → shotNo 昇順で並べた再生リストをサーバ側で都度生成する。
 * 永続化はしない（補-2-15-1）。0 件の場合はその旨のメッセージを返す（補-2-15-2）。
 *
 * 注意: このエンドポイントは `playlists` コレクションの `endpoints` に相対パス
 * `/auto` として登録する。src/endpoints/rankings.ts のコメントの通り、ルート
 * レベル（src/endpoints/index.ts）に置くと先頭セグメント `playlists` が
 * コレクションスラッグとして解決され、コレクション標準の `GET /:id`
 * （id="auto"）に奪われてしまうため。
 */

const EMPTY_MESSAGE = '本日の動画はまだありません'

const toId = (value: unknown): string | number | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return value
  return undefined
}

export const playlistsAutoEndpoint: Endpoint = {
  // playlists コレクションの endpoints に登録するため相対パス（/api/playlists + /auto）
  path: '/auto',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const query = req.query as Record<string, unknown>
    const roundId = toId(query.roundId)
    const playerId = toId(query.playerId)

    if (roundId === undefined || playerId === undefined) {
      return badRequest(
        '補-2-15-1: roundId と playerId の両方を指定してください（ラウンド × 選手）',
        !roundId ? 'roundId' : 'playerId',
      )
    }

    const conditions: Where[] = [
      { round: { equals: roundId } },
      { player: { equals: playerId } },
      // 補-2-15-1: 「当日のショット動画」が対象。ハイライト/ストーリー/選手ストーリー等は含めない
      { kind: { equals: 'shot' } },
    ]
    // スタッフ以外には下書きを出さない（Videos.ts の readPublished 相当）
    if (!isStaff(req.user as never)) {
      conditions.push({
        or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }],
      })
    }

    const result = await req.payload.find({
      collection: 'videos',
      where: { and: conditions },
      // hole 昇順 → shotNo 昇順（補-2-15-1）
      sort: ['hole', 'shotNo'],
      limit: 200,
      depth: 1,
      overrideAccess: true,
    })

    return okJson({
      roundId,
      playerId,
      count: result.docs.length,
      items: result.docs,
      message: result.docs.length === 0 ? EMPTY_MESSAGE : undefined,
    })
  },
}

export default playlistsAutoEndpoint
