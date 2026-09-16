import type { Endpoint, PayloadRequest, Where } from 'payload'

import { badRequest, okJson } from './lib/http'

/**
 * 広告配信（要求 8-3, 8-5 / 補-8-3-1, 補-8-3-2, 補-8-3-3, 補-8-3-4, 補-8-5-1 / T-15-1, T-15-2, T-15-3）
 * GET /api/ads/serve?slot=<slotKey>&tournamentId=&playerId=
 *
 * `slot`（`ad-slots.key`）で指定した枠に配信する 1 件のクリエイティブを選択して返す。
 * - 対象枠が存在しない、または配信可能なクリエイティブが 1 件もない場合は
 *   `{ slot, creative: null }` を 200 で返す（補-8-5-1: 未設定時はアプリ側で枠を非表示にする。
 *   これはエラーではないため 404 にはしない）。
 * - 選択優先順位（補-8-3-2）: 大会・選手の両方に一致 → 大会のみ一致 → 選手のみ一致 → 全体配信
 *   （tournament/player とも未設定のクリエイティブ）の順に、候補が 1 件でもある最上位の階層から選ぶ。
 * - 配信期間（startAt/endAt）と isActive で絞り込み（補-8-3-4）。
 * - 同一階層に複数候補がある場合は `weight` による重み付きランダム選択（補-8-3-4）。
 *
 * このエンドポイントは `ads` という slug のコレクションが存在しないため、
 * src/endpoints/index.ts のルートレベル `config.endpoints` に登録して問題ない
 * （rankings.ts 等のコメントにある「先頭セグメントがコレクションslugと衝突する」問題は起きない）。
 */

type AdSlotDoc = {
  id: number
  key: string
  name: string
  format: 'banner' | 'video' | 'tieup_article'
  size?: string | null
}

type MediaDoc = { id: number; url?: string | null; alt?: string | null }
type VideoDoc = {
  id: number
  title?: string | null
  hlsUrl?: string | null
  durationSec?: number | null
  file?: MediaDoc | number | null
  thumbnail?: MediaDoc | number | null
}
type NewsDoc = { id: number; title?: string | null; slug?: string | null }
type SponsorDoc = { id: number; name: string; logo?: MediaDoc | number | null; landingUrl?: string | null }

// 選定フェーズ（下の find）は depth:0（id のみ）で行う。depth>=1 で `sponsor` を populate すると
// Sponsors コレクションの `adReportSummary` 仮想フィールド（afterRead フック）が発火し、
// そのフックが ad-creatives を再検索して再び sponsor を populate する無限再帰でクラッシュする
// （`RangeError: Map maximum size exceeded` で実際に発生済み。src/lib/sponsorReport.ts 参照）。
// また 200 件の候補すべてを depth:1 で populate するのは無駄にも大きいため、
// 詳細情報は選ばれた 1 件だけを後段で個別に取得する。
type AdCreativeDoc = {
  id: number
  name: string
  sponsor: number
  slot: number
  tournament?: number | null
  player?: number | null
  image?: number | null
  video?: number | null
  article?: number | null
  linkUrl?: string | null
  weight: number
  startAt?: string | null
  endAt?: string | null
  isActive?: boolean | null
}

/** 重み付きランダム選択。重み合計が 0 以下の場合は候補内で一様ランダムに選ぶ（補-8-3-4） */
const weightedPick = <T extends { weight: number }>(candidates: T[]): T | undefined => {
  if (candidates.length === 0) return undefined
  const total = candidates.reduce((sum, c) => sum + Math.max(0, c.weight ?? 0), 0)
  if (total <= 0) return candidates[Math.floor(Math.random() * candidates.length)]

  let roll = Math.random() * total
  for (const c of candidates) {
    roll -= Math.max(0, c.weight ?? 0)
    if (roll <= 0) return c
  }
  return candidates[candidates.length - 1]
}

const mediaUrl = (m: MediaDoc | number | null | undefined): string | undefined =>
  m && typeof m === 'object' ? (m.url ?? undefined) : undefined

export const adsServeEndpoint: Endpoint = {
  path: '/ads/serve',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const query = req.query as Record<string, unknown>
    const slotKey = typeof query.slot === 'string' ? query.slot.trim() : ''
    if (!slotKey) return badRequest('slot は必須です', 'slot')

    const tournamentIdRaw = query.tournamentId
    const tournamentId =
      typeof tournamentIdRaw === 'string' && tournamentIdRaw.trim().length > 0
        ? Number(tournamentIdRaw)
        : typeof tournamentIdRaw === 'number'
          ? tournamentIdRaw
          : undefined
    const playerIdRaw = query.playerId
    const playerId =
      typeof playerIdRaw === 'string' && playerIdRaw.trim().length > 0
        ? Number(playerIdRaw)
        : typeof playerIdRaw === 'number'
          ? playerIdRaw
          : undefined

    const slotRes = await req.payload.find({
      collection: 'ad-slots',
      where: { key: { equals: slotKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const slot = slotRes.docs[0] as unknown as AdSlotDoc | undefined
    // 補-8-5-1: 枠自体が未定義でもエラーにせず「配信なし」として返す（アプリは枠を非表示にする）
    if (!slot) return okJson({ slot: slotKey, creative: null })

    const nowIso = new Date().toISOString()
    const where: Where = {
      and: [
        { slot: { equals: slot.id } },
        { isActive: { equals: true } },
        { or: [{ startAt: { exists: false } }, { startAt: { less_than_equal: nowIso } }] },
        { or: [{ endAt: { exists: false } }, { endAt: { greater_than_equal: nowIso } }] },
      ],
    }

    const result = await req.payload.find({
      collection: 'ad-creatives',
      where,
      limit: 200,
      depth: 0,
      overrideAccess: true, // 配信選択はアクセス制御(補-8-9-2)の対象外。読者へは選ばれた1件のみ返す
    })
    const candidates = result.docs as unknown as AdCreativeDoc[]

    const matchesTournament = (c: AdCreativeDoc) => tournamentId !== undefined && c.tournament === tournamentId
    const matchesPlayer = (c: AdCreativeDoc) => playerId !== undefined && c.player === playerId
    const isGeneral = (c: AdCreativeDoc) => !c.tournament && !c.player

    // 補-8-3-2: 大会・選手ともに一致 → 大会のみ一致 → 選手のみ一致 → 全体配信、の優先順位
    const tiers: AdCreativeDoc[][] = [
      tournamentId !== undefined && playerId !== undefined
        ? candidates.filter((c) => matchesTournament(c) && matchesPlayer(c))
        : [],
      tournamentId !== undefined ? candidates.filter((c) => matchesTournament(c) && !c.player) : [],
      playerId !== undefined ? candidates.filter((c) => matchesPlayer(c) && !c.tournament) : [],
      candidates.filter(isGeneral),
    ]

    const pool = tiers.find((t) => t.length > 0)
    if (!pool || pool.length === 0) return okJson({ slot: slotKey, creative: null })

    const chosen = weightedPick(pool)
    if (!chosen) return okJson({ slot: slotKey, creative: null })

    // 選ばれた 1 件だけ、表示に必要な関連情報を個別に取得する（depth:1 で sponsor.logo 等を解決）。
    // select で adReportSummary（計測イベントを集計する重い仮想フィールド）を明示的に除外し、
    // 広告配信のたびに無駄なレポート集計が走らないようにする
    const sponsorDoc = (await req.payload
      .findByID({
        collection: 'sponsors',
        id: chosen.sponsor,
        depth: 1,
        overrideAccess: true,
        select: { name: true, logo: true, landingUrl: true },
      })
      .catch(() => null)) as unknown as SponsorDoc | null

    const imageDoc =
      slot.format === 'banner' && chosen.image
        ? ((await req.payload
            .findByID({ collection: 'media', id: chosen.image, depth: 0, overrideAccess: true })
            .catch(() => null)) as unknown as MediaDoc | null)
        : null

    const videoDoc =
      slot.format === 'video' && chosen.video
        ? ((await req.payload
            .findByID({ collection: 'videos', id: chosen.video, depth: 1, overrideAccess: true })
            .catch(() => null)) as unknown as VideoDoc | null)
        : null

    const articleDoc =
      slot.format === 'tieup_article' && chosen.article
        ? ((await req.payload
            .findByID({ collection: 'news', id: chosen.article, depth: 0, overrideAccess: true })
            .catch(() => null)) as unknown as NewsDoc | null)
        : null

    return okJson({
      slot: slotKey,
      creative: {
        id: chosen.id,
        name: chosen.name,
        format: slot.format,
        sponsor: sponsorDoc
          ? { id: sponsorDoc.id, name: sponsorDoc.name, logoUrl: mediaUrl(sponsorDoc.logo) }
          : { id: chosen.sponsor },
        banner: slot.format === 'banner' ? { imageUrl: mediaUrl(imageDoc), alt: sponsorDoc?.name ?? null } : null,
        video:
          slot.format === 'video' && videoDoc
            ? {
                id: videoDoc.id,
                title: videoDoc.title ?? null,
                hlsUrl: videoDoc.hlsUrl ?? null,
                fileUrl: mediaUrl(videoDoc.file) ?? null,
                durationSec: videoDoc.durationSec ?? null,
              }
            : null,
        article:
          slot.format === 'tieup_article' && articleDoc
            ? { id: articleDoc.id, title: articleDoc.title ?? null, slug: articleDoc.slug ?? null }
            : null,
        linkUrl: chosen.linkUrl || sponsorDoc?.landingUrl || null,
        targeting: {
          tournamentId: chosen.tournament ?? null,
          playerId: chosen.player ?? null,
        },
      },
    })
  },
}

export default adsServeEndpoint
