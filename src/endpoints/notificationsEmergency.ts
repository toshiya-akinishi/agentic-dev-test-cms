import type { Endpoint, PayloadRequest } from 'payload'

import { isOperator } from '../access'
import { badRequest, forbidden, okJson, readJsonBody, unauthorized } from './lib/http'
import { notifyUser } from './lib/notify'

/**
 * 緊急通知の CMS 発行（要求 1-23 / 補-1-23-1〜4 / T-14-3）
 * POST /api/notifications/emergency
 *
 * body: {
 *   kind: '中止' | '順延' | '中断' | '再開' | '雷警報' | '避難指示'  (補-1-23-1 の6種)
 *   title?: string          // 省略時は kind から自動生成
 *   body: string            // 本文
 *   tournamentId?: number   // 関連大会（中止/順延/再開で status を連動更新する場合に必須）
 *   roundId?: number        // 関連ラウンド（中断/再開で status を連動更新する場合に必須）
 *   deepLink?: string
 * }
 *
 * 補-1-23-2 / ADR-015: ユーザーの通知設定・マスタースイッチに一切関わらず全員へ配信する。
 * 実装は「audience=all の notifications レコードを 1 件作成する」だけでよい。
 * 通知センター（GET /me）は audience=all のレコードを設定に関係なく必ず返すため、
 * マスタースイッチ OFF のユーザーにも自然に届く（判定ロジック側で除外しない = そもそも
 * ユーザー単位のフィルタを一切経由しない設計）。
 *
 * 補-1-23-3: 発行は CMS の operator 以上（admin/operator）。
 * 補-1-23-4: 大会/ラウンドの status を中止・順延・中断・再開に連動させることで、
 * アプリ側の「赤色バナー常時表示」条件（tournament.status が cancelled/postponed、
 * または round.status が suspended の間）を満たすデータ状態を作る。
 *
 * このエンドポイントは Notifications コレクションの endpoints に相対パスで登録する
 * （cutProbability.ts / rankings.ts と同じ理由。ルート登録だと `/notifications/:id` に奪われる）。
 */

const EMERGENCY_KINDS = ['中止', '順延', '中断', '再開', '雷警報', '避難指示'] as const
type EmergencyKind = (typeof EMERGENCY_KINDS)[number]
const isEmergencyKind = (v: unknown): v is EmergencyKind =>
  typeof v === 'string' && (EMERGENCY_KINDS as readonly string[]).includes(v)

const DEFAULT_TITLE: Record<EmergencyKind, string> = {
  中止: '【大会中止】お知らせ',
  順延: '【大会順延】お知らせ',
  中断: '【競技中断】お知らせ',
  再開: '【競技再開】お知らせ',
  雷警報: '【雷警報】安全のため速やかに避難してください',
  避難指示: '【避難指示】速やかに指定の避難場所へ移動してください',
}

type EmergencyBody = {
  kind?: unknown
  title?: unknown
  body?: unknown
  tournamentId?: unknown
  roundId?: unknown
  deepLink?: unknown
}

export const notificationsEmergencyEndpoint: Endpoint = {
  path: '/emergency',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized('ログインが必要です')
    if (!isOperator(req.user as never)) {
      return forbidden('緊急通知の発行は運営（operator）以上のみ許可されています（補-1-23-3）')
    }

    const body = await readJsonBody<EmergencyBody>(req)

    if (!isEmergencyKind(body.kind)) {
      return badRequest(`kind は ${EMERGENCY_KINDS.join(' / ')} のいずれかを指定してください`, 'kind')
    }
    const bodyText = typeof body.body === 'string' ? body.body.trim() : ''
    if (!bodyText) return badRequest('body は必須です', 'body')

    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : DEFAULT_TITLE[body.kind]
    const deepLink = typeof body.deepLink === 'string' ? body.deepLink : undefined

    const tournamentId =
      typeof body.tournamentId === 'string' || typeof body.tournamentId === 'number'
        ? Number(body.tournamentId)
        : undefined
    const roundId =
      typeof body.roundId === 'string' || typeof body.roundId === 'number' ? Number(body.roundId) : undefined

    if (tournamentId !== undefined) {
      const tournament = await req.payload.findByID({
        collection: 'tournaments',
        id: tournamentId,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null)
      if (!tournament) return badRequest('tournamentId に対応する大会が見つかりませんでした', 'tournamentId')
    }
    if (roundId !== undefined) {
      const round = await req.payload.findByID({
        collection: 'rounds',
        id: roundId,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null)
      if (!round) return badRequest('roundId に対応するラウンドが見つかりませんでした', 'roundId')
    }

    // ADR-015: 設定を一切参照せず、全員 (audience=all) へ 1 件だけ発行する
    const result = await notifyUser(req.payload, {
      audience: 'all',
      type: 'emergency',
      title,
      body: bodyText,
      deepLink,
      tournament: tournamentId,
      priority: 'high',
      // 緊急通知は再発行のたびに新規レコードとして残す（同一状況の続報もあり得るため dedupeKey は使わない）
    })

    // 補-1-23-4: 大会/ラウンドの status を連動させる（アプリの赤色バナー表示条件）
    const statusUpdates: { tournamentStatus?: string; roundStatus?: string } = {}
    if (tournamentId !== undefined && (body.kind === '中止' || body.kind === '順延' || body.kind === '再開')) {
      const nextStatus = body.kind === '中止' ? 'cancelled' : body.kind === '順延' ? 'postponed' : 'live'
      await req.payload.update({
        collection: 'tournaments',
        id: tournamentId,
        data: { status: nextStatus },
        overrideAccess: true,
      })
      statusUpdates.tournamentStatus = nextStatus
    }
    if (roundId !== undefined && (body.kind === '中断' || body.kind === '再開')) {
      const nextStatus = body.kind === '中断' ? 'suspended' : 'live'
      await req.payload.update({
        collection: 'rounds',
        id: roundId,
        data: { status: nextStatus },
        overrideAccess: true,
      })
      statusUpdates.roundStatus = nextStatus
    }

    return okJson({
      message: '緊急通知を全ユーザーへ発行しました（マスタースイッチの設定に関わらず配信・補-1-23-2）',
      notification: result,
      statusUpdates,
    })
  },
}
