import type { Endpoint, PayloadRequest, Where } from 'payload'

import { isStaff } from '../access'
import { badRequest, forbidden, notFound, okJson, unauthorized } from './lib/http'
import type { NotifyRecipient } from './lib/notify'
import { notifyUser, recipientKeyOf } from './lib/notify'

/**
 * 通知発火ジョブ（オンデマンド版）（要求 3-5, 4-15, 4-17, 4-18, 4-19 / T-14-2, T-14-6, T-14-7, T-14-8, T-14-9）
 * POST /api/notifications/run-checks?tournamentId=<id>
 *
 * ============================================================================
 * 設計方針（ADR-013 を踏まえた重要な決定・依頼文の「設計アプローチ」節に対応）
 * ============================================================================
 * この検証環境には実運用の cron/スケジューラが無く、FCM/APNs 証明書もない（ADR-013）。
 * そのため「スコア変動を検知して即座に発火する」常駐ジョブではなく、呼ばれるたびに
 * 現在のデータ（scores / pairings / notification-settings）に対して判定ロジックを
 * **全量再評価**し、まだ生成していない通知だけを作成する on-demand エンドポイントとして
 * 実装する。cutProbability.ts が「都度計算・値を保存しない」設計を採っているのと同じ考え方。
 * 実運用に移行する際は、このエンドポイントを Cloud Scheduler 等から
 * 数十秒〜数分間隔で叩く（あるいはスコア更新の webhook から呼ぶ）だけで済む構造にしてある。
 *
 * 冪等性は `notifications.dedupeKey`（unique）で担保する。同じイベント×宛先に対して
 * 二重に notifications レコードが作られることはない（lib/notify.ts 参照）。
 *
 * ============================================================================
 * 対象ユーザーの抽出方針（各ジョブで判定根拠が異なる点に注意）
 * ============================================================================
 * - 好スコア (T-14-7 / 4-15): `notification-settings.perPlayer[].goodScore === true`
 *   の設定がある選手について判定する（お気に入りかどうかは問わない。補-4-16-2）。
 * - カット確定 (T-14-8 / 4-18): perPlayer に「カット確定」専用のトグルは存在しない
 *   （cutLineChange は"変動中"の通知用。補-4-18-1 のコメント参照）ため、
 *   4-18 のユーザーストーリー原文「推し選手が予選通過したか即時通知」に従い
 *   **お気に入り登録 (favorites)** をゲート条件とする。
 * - 優勝争い (T-14-9 / 3-5, 4-19): `notification-settings.titleRace === true`
 *   （選手別設定とは独立。補-4-19-1）。favorites は問わず、争っている選手全員が対象になる。
 * - スタートリマインド (T-14-6 / 4-17): `perPlayer[].startReminder30/15 === true`。
 *
 * いずれも T-14-10 / ADR-015 により、マスタースイッチ (`notification-settings.master`)
 * が false のユーザー/端末には（emergency 以外なので）通知を生成しない。
 * 設定レコード自体が存在しない場合はフィールド既定値（master=true）に倣い許可する。
 */

type ScoreRow = {
  id: number
  player: unknown
  round: unknown
  status: 'playing' | 'finished' | 'cut' | 'wd' | 'dq'
  thru?: number | null
  toPar: number
  holeScores?: { hole: number; result: string }[] | null
}

type RoundDoc = {
  id: number
  number: number
  status: 'scheduled' | 'live' | 'finished' | 'suspended'
  tournament: unknown
}

type TournamentDoc = {
  id: number
  name: string
  cutLineAfterRound: number
  cutRule?: string | null
}

type PairingDoc = {
  id: number
  round: unknown
  groupNo: number
  startTime: string
  players?: unknown[] | null
}

type PlayerRef = { id: number; name?: string }

type PerPlayerSetting = {
  player: unknown
  birdie?: boolean | null
  eagle?: boolean | null
  bogeyOrWorse?: boolean | null
  cutLineChange?: boolean | null
  top10?: boolean | null
  startReminder30?: boolean | null
  startReminder15?: boolean | null
  goodScore?: boolean | null
}

type NotificationSettingDoc = {
  id: number
  owner?: unknown
  deviceId?: string | null
  master?: boolean | null
  titleRace?: boolean | null
  perPlayer?: PerPlayerSetting[] | null
}

type FavoriteDoc = { id: number; owner?: unknown; deviceId?: string | null; player: unknown }

const relId = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
  }
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
}

const DEFAULT_CUT_SIZE = 45
/** cutProbability.ts と同じロジック（意図的に複製。エンドポイント間の依存を避けるための本リポジトリの慣習） */
const parseCutSize = (cutRule: string | null | undefined): number => {
  const m = cutRule?.match(/(\d+)\s*位/)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CUT_SIZE
}

const recipientOf = (settings: { owner?: unknown; deviceId?: unknown | null }): NotifyRecipient | undefined => {
  const ownerId = relId(settings.owner)
  if (ownerId !== undefined) return { audience: 'user', targetUser: ownerId }
  if (typeof settings.deviceId === 'string' && settings.deviceId.trim()) {
    return { audience: 'device', targetDeviceId: settings.deviceId }
  }
  return undefined
}

const masterIsOn = (settings: NotificationSettingDoc | undefined): boolean =>
  settings ? settings.master !== false : true // 設定未登録ならフィールド既定値 (true) に倣う

/** 5 分間のクールダウンをタイムバケットで表現する（T-14-9 補-3-5「5分の連投抑止」） */
const TITLE_RACE_COOLDOWN_MS = 5 * 60 * 1000
const titleRaceBucket = (now: number): number => Math.floor(now / TITLE_RACE_COOLDOWN_MS)

const TITLE_RACE_HOLES_REMAINING = 6
const TITLE_RACE_STROKE_MARGIN = 2

export const notificationsRunChecksEndpoint: Endpoint = {
  path: '/run-checks',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized('ログインが必要です')
    if (!isStaff(req.user as never)) {
      return forbidden('通知判定ジョブの実行は編集者以上（admin/editor/operator）のみ許可されています')
    }

    const query = req.query as Record<string, unknown>
    const tournamentIdRaw = query.tournamentId
    const tournamentId =
      typeof tournamentIdRaw === 'string' || typeof tournamentIdRaw === 'number' ? tournamentIdRaw : undefined
    if (tournamentId === undefined) return badRequest('tournamentId は必須です', 'tournamentId')

    const tournament = (await req.payload
      .findByID({ collection: 'tournaments', id: tournamentId, depth: 0, overrideAccess: true })
      .catch(() => null)) as TournamentDoc | null
    if (!tournament) return notFound('大会が見つかりませんでした')

    const appSettings = await req.payload.findGlobal({ slug: 'app-settings', depth: 0, overrideAccess: true })
    const goodScoreToPar =
      typeof (appSettings as { goodScoreToPar?: number }).goodScoreToPar === 'number'
        ? (appSettings as { goodScoreToPar: number }).goodScoreToPar
        : -4

    const roundsRes = await req.payload.find({
      collection: 'rounds',
      where: { tournament: { equals: tournament.id } } as Where,
      sort: 'number',
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    const rounds = roundsRes.docs as unknown as RoundDoc[]
    const roundIds = rounds.map((r) => r.id)
    if (roundIds.length === 0) {
      return okJson({ tournament: { id: tournament.id, name: tournament.name }, generated: {}, message: 'ラウンドがまだ登録されていません' })
    }

    // 判定対象になり得る全設定・お気に入りを 1 回だけ取得する（件数が小さい検証環境向けの簡易実装。
    // Payload の配列サブフィールドに対する複合条件クエリの信頼性が低いため、JS 側でフィルタする）
    const settingsRes = await req.payload.find({
      collection: 'notification-settings',
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    })
    const allSettings = settingsRes.docs as unknown as NotificationSettingDoc[]

    const favoritesRes = await req.payload.find({
      collection: 'favorites',
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
    const allFavorites = favoritesRes.docs as unknown as FavoriteDoc[]
    const favoriteRecipientsByPlayer = new Map<number, NotifyRecipient[]>()
    for (const fav of allFavorites) {
      const pid = relId(fav.player)
      if (pid === undefined) continue
      const r = recipientOf(fav)
      if (!r) continue
      const list = favoriteRecipientsByPlayer.get(pid) ?? []
      list.push(r)
      favoriteRecipientsByPlayer.set(pid, list)
    }

    const playerCache = new Map<number, PlayerRef>()
    const playerNameOf = async (playerId: number): Promise<string> => {
      const cached = playerCache.get(playerId)
      if (cached) return cached.name ?? `選手#${playerId}`
      const p = await req.payload
        .findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true })
        .catch(() => null)
      const name = (p as { name?: string } | null)?.name ?? `選手#${playerId}`
      playerCache.set(playerId, { id: playerId, name })
      return name
    }

    const counters = { goodScore: 0, cutLine: 0, titleRace: 0, startReminder: 0, skippedDuplicates: 0 }
    const record = (created: boolean) => (created ? undefined : counters.skippedDuplicates++)

    // ------------------------------------------------------------------
    // T-14-7 (4-15): 好スコア判定 — 通算 goodScoreToPar 以下 到達、または 1 ホールでイーグル以上
    // ------------------------------------------------------------------
    for (const round of rounds) {
      if (round.status === 'scheduled') continue // 未着手ラウンドにはスコアが無い
      const scoresRes = await req.payload.find({
        collection: 'scores',
        where: { round: { equals: round.id } } as Where,
        limit: 300,
        depth: 0,
        overrideAccess: true,
      })
      const rows = scoresRes.docs as unknown as ScoreRow[]

      for (const row of rows) {
        const playerId = relId(row.player)
        if (playerId === undefined) continue
        const thru = row.thru ?? 0
        if (thru <= 0) continue // 未着手

        // 4-15 の判定に反応する設定を持つユーザー/端末を抽出（perPlayer.goodScore===true）
        const recipients: NotifyRecipient[] = []
        for (const s of allSettings) {
          if (!masterIsOn(s)) continue
          const pp = s.perPlayer?.find((e) => relId(e.player) === playerId)
          if (pp?.goodScore) {
            const r = recipientOf(s)
            if (r) recipients.push(r)
          }
        }
        if (recipients.length === 0) continue

        const name = await playerNameOf(playerId)

        // (a) 通算スコア到達
        if (row.status !== 'cut' && row.status !== 'wd' && row.status !== 'dq' && row.toPar <= goodScoreToPar) {
          for (const recipient of recipients) {
            const res = await notifyUser(req.payload, {
              ...recipient,
              type: 'player_event',
              title: `${name}選手が好スコア！`,
              body: `${name}選手が通算 ${row.toPar} で好スコア圏内です（${goodScoreToPar} 以下）。`,
              tournament: tournament.id,
              player: playerId,
              deepLink: `jtour://leaderboard/${tournament.id}?player=${playerId}`,
              dedupeKey: `good_score:total:${round.id}:${playerId}:${recipientKeyOf(recipient)}`,
            })
            counters.goodScore += res.created ? 1 : 0
            record(res.created)
          }
        }

        // (b) 1 ホールでイーグル以上（resultOf の定義上 'eagle' はイーグル・アルバトロス・ホールインワンを含む）
        for (const hole of row.holeScores ?? []) {
          if (hole.result !== 'eagle') continue
          for (const recipient of recipients) {
            const res = await notifyUser(req.payload, {
              ...recipient,
              type: 'player_event',
              title: `${name}選手がイーグル以上！`,
              body: `${name}選手が ${hole.hole}番ホールでイーグル以上のスコアを記録しました。`,
              tournament: tournament.id,
              player: playerId,
              deepLink: `jtour://leaderboard/${tournament.id}?player=${playerId}`,
              dedupeKey: `good_score:hole:${round.id}:${playerId}:${hole.hole}:${recipientKeyOf(recipient)}`,
            })
            counters.goodScore += res.created ? 1 : 0
            record(res.created)
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // T-14-8 (4-18): カット通過/落選確定 — 予選ラウンド終了時点でのみ発火
    // ------------------------------------------------------------------
    const cutRoundNumber = tournament.cutLineAfterRound ?? 2
    const cutRound = rounds.find((r) => r.number === cutRoundNumber)
    if (cutRound && cutRound.status === 'finished') {
      const scoresRes = await req.payload.find({
        collection: 'scores',
        where: { round: { equals: cutRound.id } } as Where,
        limit: 300,
        depth: 0,
        overrideAccess: true,
      })
      const rows = scoresRes.docs as unknown as ScoreRow[]

      if (rows.length > 0) {
        const cutSize = parseCutSize(tournament.cutRule)
        const sorted = [...rows].map((r) => r.toPar).sort((a, b) => a - b)
        const cutLineToPar = sorted[Math.min(cutSize, sorted.length) - 1]!

        for (const row of rows) {
          if (row.status === 'wd' || row.status === 'dq') continue // 棄権/失格は対象外
          const playerId = relId(row.player)
          if (playerId === undefined) continue
          const passed = row.status === 'cut' ? false : row.toPar <= cutLineToPar

          const recipients = favoriteRecipientsByPlayer.get(playerId) ?? []
          if (recipients.length === 0) continue
          const name = await playerNameOf(playerId)

          for (const recipient of recipients) {
            const s = allSettings.find((doc) => {
              const r = recipientOf(doc)
              return r && recipientKeyOf(r) === recipientKeyOf(recipient)
            })
            if (!masterIsOn(s)) continue

            const res = await notifyUser(req.payload, {
              ...recipient,
              type: 'cut_line',
              title: passed ? `${name}選手が予選通過！` : `${name}選手 予選落ち`,
              body: passed
                ? `${name}選手が予選（第${cutRoundNumber}ラウンド終了時点）を通過しました。`
                : `${name}選手は予選（第${cutRoundNumber}ラウンド終了時点）で落選が確定しました。`,
              tournament: tournament.id,
              player: playerId,
              deepLink: `jtour://leaderboard/${tournament.id}?player=${playerId}`,
              dedupeKey: `cut_line:${cutRound.id}:${playerId}:${recipientKeyOf(recipient)}`,
            })
            counters.cutLine += res.created ? 1 : 0
            record(res.created)
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // T-14-9 (3-5 / 4-19): 優勝争い — 進行中ラウンドで「残6H以内 かつ 首位と2打差以内」
    // ------------------------------------------------------------------
    const liveRound = rounds.find((r) => r.status === 'live')
    if (liveRound) {
      const scoresRes = await req.payload.find({
        collection: 'scores',
        where: { round: { equals: liveRound.id } } as Where,
        limit: 300,
        depth: 0,
        overrideAccess: true,
      })
      const rows = (scoresRes.docs as unknown as ScoreRow[]).filter(
        (r) => r.status !== 'cut' && r.status !== 'wd' && r.status !== 'dq',
      )
      if (rows.length > 0) {
        const leaderToPar = Math.min(...rows.map((r) => r.toPar))
        const contenders = rows.filter((r) => {
          const holesRemaining = 18 - (r.thru ?? 18)
          const diff = r.toPar - leaderToPar
          return holesRemaining <= TITLE_RACE_HOLES_REMAINING && diff <= TITLE_RACE_STROKE_MARGIN
        })

        if (contenders.length > 0) {
          // titleRace===true の設定を持つユーザー/端末（選手別設定とは独立。補-4-19-1）
          const subscribers = allSettings.filter((s) => s.titleRace === true && masterIsOn(s))
          const now = Date.now()
          const bucket = titleRaceBucket(now)

          for (const row of contenders) {
            const playerId = relId(row.player)
            if (playerId === undefined) continue
            const name = await playerNameOf(playerId)
            const holesRemaining = 18 - (row.thru ?? 18)
            const diff = row.toPar - leaderToPar

            for (const s of subscribers) {
              const recipient = recipientOf(s)
              if (!recipient) continue
              const res = await notifyUser(req.payload, {
                ...recipient,
                type: 'title_race',
                title: '優勝争い速報',
                body:
                  diff === 0
                    ? `${name}選手が首位と並んで残り${holesRemaining}ホールの優勝争いです。`
                    : `${name}選手が首位と${diff}打差、残り${holesRemaining}ホールの優勝争いです。`,
                tournament: tournament.id,
                player: playerId,
                deepLink: `jtour://leaderboard/${tournament.id}?player=${playerId}`,
                // 5分バケットで冪等キーを作ることで「5分の連投抑止」を表現する（補-3-5）。
                // バケットが変わる（5分経過する）と新しい速報として再度発火し得る。
                dedupeKey: `title_race:${playerId}:${recipientKeyOf(recipient)}:${bucket}`,
              })
              counters.titleRace += res.created ? 1 : 0
              record(res.created)
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // T-14-6 (4-17): スタートリマインド 30分前/15分前（ペアリング変更時は startTime 込みで再計算される）
    // ------------------------------------------------------------------
    const pairingsRes = await req.payload.find({
      collection: 'pairings',
      where: { round: { in: roundIds } } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    const pairings = pairingsRes.docs as unknown as PairingDoc[]
    const now = Date.now()

    for (const pairing of pairings) {
      const players = (pairing.players ?? []).map((p) => relId(p)).filter((v): v is number => v !== undefined)
      if (players.length === 0) continue

      const minutesUntil = (new Date(pairing.startTime).getTime() - now) / 60000
      let reminderType: '30' | '15' | undefined
      if (minutesUntil > 15 && minutesUntil <= 30) reminderType = '30'
      else if (minutesUntil > 0 && minutesUntil <= 15) reminderType = '15'
      if (!reminderType) continue

      for (const playerId of players) {
        const name = await playerNameOf(playerId)
        for (const s of allSettings) {
          if (!masterIsOn(s)) continue
          const pp = s.perPlayer?.find((e) => relId(e.player) === playerId)
          const enabled = reminderType === '30' ? pp?.startReminder30 : pp?.startReminder15
          if (!enabled) continue
          const recipient = recipientOf(s)
          if (!recipient) continue

          const res = await notifyUser(req.payload, {
            ...recipient,
            type: 'start_reminder',
            title: `${name}選手 まもなくスタート`,
            body: `${name}選手のスタート（第${pairing.groupNo}組）まであと${reminderType}分です。`,
            tournament: tournament.id,
            player: playerId,
            deepLink: `jtour://leaderboard/${tournament.id}?player=${playerId}`,
            // pairing.startTime を含めることで「ペアリング変更（時刻変更）時の再計算」を表現する（補-4-17-1）
            dedupeKey: `start_reminder:${reminderType}:${pairing.id}:${playerId}:${recipientKeyOf(recipient)}:${pairing.startTime}`,
          })
          counters.startReminder += res.created ? 1 : 0
          record(res.created)
        }
      }
    }

    return okJson({
      tournament: { id: tournament.id, name: tournament.name },
      generated: counters,
      message: 'run-checks 完了（既存イベントは dedupeKey により再生成されません）',
    })
  },
}
