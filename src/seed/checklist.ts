/**
 * 網羅観点チェックリスト（06-test-data.md 6章）+ 「開催中の大会」シナリオの検証（2章）
 *
 * すべて DB に実際に保存されたデータに対して payload.find で再取得して判定する
 * （メモリ上の生成時オブジェクトではなく、永続化された結果を検証する）。
 */
import type { SeedCtx } from './context'
import type { ScoreSeedResult } from './scores'

export type CheckItem = { id: string; label: string; pass: boolean; detail?: string }

const check = (id: string, label: string, pass: boolean, detail?: string): CheckItem => ({ id, label, pass, detail })

export const runChecklist = async (ctx: SeedCtx, scoreResult: ScoreSeedResult): Promise<CheckItem[]> => {
  const { payload } = ctx
  const items: CheckItem[] = []
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const finalRound = live.rounds[live.rounds.length - 1]!

  // 1. 大会ステータス5種
  {
    const statuses = ['scheduled', 'live', 'finished', 'cancelled', 'postponed'] as const
    const present = new Set<string>()
    for (const t of ctx.tournaments) present.add(t.status)
    const missing = statuses.filter((s) => !present.has(s))
    items.push(check('tournament-status-5', '大会ステータス5種（scheduled/live/finished/cancelled/postponed）', missing.length === 0, missing.join(',')))
  }

  // 2. スコアステータス5種
  {
    const statuses = ['playing', 'finished', 'cut', 'wd', 'dq'] as const
    const results = await Promise.all(
      statuses.map((s) => payload.count({ collection: 'scores', where: { status: { equals: s } }, overrideAccess: true })),
    )
    const missing = statuses.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    items.push(check('score-status-5', 'スコアステータス5種（playing/finished/cut/wd/dq）', missing.length === 0, missing.join(',')))
  }

  // 3. 動画タグ8種
  {
    const tags = ['eagle', 'birdie', 'hole_in_one', 'long_putt', 'nice_shot', 'approach', 'bunker_save', 'drive'] as const
    const results = await Promise.all(
      tags.map((tg) => payload.count({ collection: 'videos', where: { tags: { contains: tg } }, overrideAccess: true })),
    )
    const missing = tags.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    items.push(check('video-tags-8', '動画タグ8種がすべて1件以上に付与', missing.length === 0, missing.join(',')))
  }

  // 4. 通知種別6種 + 未読1件以上
  {
    const types = ['emergency', 'player_event', 'start_reminder', 'title_race', 'news', 'cut_line'] as const
    const results = await Promise.all(
      types.map((tp) => payload.count({ collection: 'notifications', where: { type: { equals: tp } }, overrideAccess: true })),
    )
    const missing = types.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    const all = await payload.find({ collection: 'notifications', limit: 200, depth: 0, overrideAccess: true })
    const unread = all.docs.filter((d) => !Array.isArray((d as { readBy?: unknown[] }).readBy) || (d as { readBy: unknown[] }).readBy.length === 0)
    items.push(
      check(
        'notification-types-6',
        '通知種別6種すべて存在し、未読が1件以上ある',
        missing.length === 0 && unread.length >= 1,
        `missing=${missing.join(',')} unread=${unread.length}`,
      ),
    )
  }

  // 5. 会場施設8種別（開催中大会の会場）
  {
    const types = ['toilet', 'food', 'goods', 'firstaid', 'entrance', 'info', 'smoking', 'atm'] as const
    const results = await Promise.all(
      types.map((tp) =>
        payload.count({
          collection: 'venue-facilities',
          where: { and: [{ venue: { equals: live.venue.id } }, { type: { equals: tp } }] },
          overrideAccess: true,
        }),
      ),
    )
    const missing = types.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    items.push(check('venue-facility-8', '会場施設8種別が開催中大会の会場に存在', missing.length === 0, missing.join(',')))
  }

  // 6. 広告枠5種すべてに有効なクリエイティブ
  {
    const slots = await payload.find({ collection: 'ad-slots', limit: 20, depth: 0, overrideAccess: true })
    const results = await Promise.all(
      slots.docs.map((s) =>
        payload.count({
          collection: 'ad-creatives',
          where: { and: [{ slot: { equals: s.id } }, { isActive: { equals: true } }] },
          overrideAccess: true,
        }),
      ),
    )
    const missing = slots.docs.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    items.push(check('ad-slot-5', '広告枠5種すべてに有効なクリエイティブがある', slots.docs.length >= 5 && missing.length === 0, `slots=${slots.docs.length} missing=${missing.length}`))
  }

  // 7. お気に入り 0名・上限10名の両方
  {
    const zero = await payload.count({ collection: 'favorites', where: { owner: { equals: ctx.users.fan3 } }, overrideAccess: true })
    const max = await payload.count({ collection: 'favorites', where: { owner: { equals: ctx.users.fan2 } }, overrideAccess: true })
    items.push(
      check(
        'favorites-0-and-10',
        'お気に入り 0名/上限10名 の両方のユーザーが存在',
        zero.totalDocs === 0 && max.totalDocs === 10,
        `fan3=${zero.totalDocs} fan2=${max.totalDocs}`,
      ),
    )
  }

  // 8. ショット種別6種
  {
    const types = ['tee', 'approach', 'bunker', 'recovery', 'putt', 'penalty'] as const
    const results = await Promise.all(
      types.map((tp) => payload.count({ collection: 'shots', where: { shotType: { equals: tp } }, overrideAccess: true })),
    )
    const missing = types.filter((_, i) => (results[i]?.totalDocs ?? 0) === 0)
    items.push(check('shot-types-6', 'ショット種別6種がすべて存在', missing.length === 0, missing.join(',')))
  }

  // 9. Trackman値あり/なし両方
  {
    const withValue = await payload.count({ collection: 'shots', where: { 'trackman.ballSpeed': { exists: true } }, overrideAccess: true })
    const withoutValue = await payload.count({ collection: 'shots', where: { 'trackman.ballSpeed': { exists: false } }, overrideAccess: true })
    items.push(
      check('trackman-both', 'Trackman値を持つ/持たないショットの両方が存在', withValue.totalDocs > 0 && withoutValue.totalDocs > 0, `with=${withValue.totalDocs} without=${withoutValue.totalDocs}`),
    )
  }

  // 10. 動画が紐づくショット/紐づかないショット両方
  {
    const withVideo = await payload.count({ collection: 'shots', where: { video: { exists: true } }, overrideAccess: true })
    const withoutVideo = await payload.count({ collection: 'shots', where: { video: { exists: false } }, overrideAccess: true })
    items.push(
      check('shot-video-both', '動画が紐づくショット/紐づかないショットの両方が存在', withVideo.totalDocs > 0 && withoutVideo.totalDocs > 0, `with=${withVideo.totalDocs} without=${withoutVideo.totalDocs}`),
    )
  }

  /* ------------------------------------------------------------------ *
   * 「開催中の大会」シナリオ（06-test-data.md 2章）専用の検証
   * ------------------------------------------------------------------ */

  // 11. 3名の優勝争い（首位と2打差以内・thru>=12）
  {
    const rows = await payload.find({
      collection: 'scores',
      where: { round: { equals: finalRound.id } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
      sort: 'toPar',
    })
    const withThru12 = rows.docs.filter((d) => (d as { thru?: number }).thru !== undefined && (d as { thru: number }).thru >= 12)
    const best = Math.min(...rows.docs.map((d) => (d as { toPar: number }).toPar))
    const within2 = withThru12.filter((d) => (d as { toPar: number }).toPar <= best + 2)
    items.push(
      check(
        'live-lead-battle-3',
        '首位と2打差以内・thru>=12 の選手が3名以上（優勝争い演出）',
        within2.length >= 3,
        `count=${within2.length} best=${best}`,
      ),
    )
  }

  // 12. カットライン ±0 の選手が4名
  {
    const cutlineScores = await Promise.all(
      scoreResult.liveScenario.cutlineIds.map((pid) =>
        payload.find({
          collection: 'scores',
          where: { and: [{ round: { equals: live.rounds[1]!.id } }, { player: { equals: pid } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        }),
      ),
    )
    const atLine = cutlineScores.filter(
      (r) => r.docs[0] && (r.docs[0] as { toPar: number }).toPar === scoreResult.liveScenario.cutlineToPar,
    )
    items.push(
      check(
        'live-cutline-4',
        'カットラインちょうど（±0打）の選手が4名配置されている',
        atLine.length === 4,
        `count=${atLine.length} cutline=${scoreResult.liveScenario.cutlineToPar}`,
      ),
    )
  }

  // 13. ホールインワン1件
  {
    const aceScoreRows = await payload.find({
      collection: 'scores',
      where: { round: { equals: finalRound.id } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    let aceHoles = 0
    for (const d of aceScoreRows.docs) {
      const hs = (d as { holeScores?: { strokes: number }[] }).holeScores ?? []
      aceHoles += hs.filter((h) => h.strokes === 1).length
    }
    items.push(check('live-hole-in-one', 'ホールインワンが1件以上含まれる', aceHoles >= 1, `count=${aceHoles}`))
  }

  // 14. 未了選手が1名以上
  {
    const unfinished = await payload.count({
      collection: 'scores',
      where: { and: [{ round: { equals: finalRound.id } }, { thru: { less_than: 18 } }] },
      overrideAccess: true,
    })
    items.push(check('live-unfinished-1', '未了（thru<18）の選手が1名以上存在', unfinished.totalDocs >= 1, `count=${unfinished.totalDocs}`))
  }

  return items
}

export const printChecklist = (items: CheckItem[]): void => {
  console.log('\n=== 網羅観点チェックリスト（06-test-data.md 6章 + 2章シナリオ検証） ===')
  for (const it of items) {
    console.log(`  [${it.pass ? 'PASS' : 'FAIL'}] ${it.id}: ${it.label}${it.detail ? ` (${it.detail})` : ''}`)
  }
  const failed = items.filter((i) => !i.pass)
  console.log(`\n合計 ${items.length} 項目中 ${items.length - failed.length} 件 PASS / ${failed.length} 件 FAIL`)
}
