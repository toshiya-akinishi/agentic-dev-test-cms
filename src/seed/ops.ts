/**
 * 運営系データ（選手位置 / 通知 / 広告 / 計測イベント / グローバル設定）
 */
import type { SeedCtx } from './context'
import { bump } from './context'
import { colorFor, svgCard, uploadSvg } from './media'
import { streamFor } from './rng'
import type { ScoreSeedResult } from './scores'
import type { UsersSeedResult } from './users'
import { addDays, addMinutes, alongWithOffset, iso, rich } from './util'

/* ------------------------------------------------------------------ *
 * 選手位置情報（1-31・開催中大会のラウンド進行中選手）
 * ------------------------------------------------------------------ */

export const seedPlayerPositions = async (ctx: SeedCtx, scoreResult: ScoreSeedResult): Promise<void> => {
  const rng = streamFor('player-positions')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const finalRound = live.rounds[live.rounds.length - 1]!
  const holeByNumber = new Map(live.venue.course.holes.map((h) => [h.number, h]))

  const rows = [...scoreResult.rows.values()].filter((r) => r.roundId === finalRound.id)
  for (const row of rows) {
    const currentHoleNo = Math.min(18, row.thru + 1)
    const hole = holeByNumber.get(currentHoleNo) ?? holeByNumber.get(row.thru) ?? live.venue.course.holes[0]!
    const loc = alongWithOffset(hole.tee, hole.green, rng.float(0.1, 0.8), rng.float(-15, 15))
    await ctx.payload.create({
      collection: 'player-positions',
      data: {
        tournament: live.id,
        player: row.playerId,
        location: loc,
        hole: hole.number,
        recordedAt: iso(addMinutes(ctx.today, rng.int(0, 300))),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'player-positions')
  }
}

/* ------------------------------------------------------------------ *
 * 通知（6種別 × 5件 = 30件・未読6件以上）
 * ------------------------------------------------------------------ */

export const seedNotifications = async (
  ctx: SeedCtx,
  scoreResult: ScoreSeedResult,
  users: UsersSeedResult,
): Promise<void> => {
  const rng = streamFor('notifications')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const scheduled = ctx.tournaments.find((t) => t.kind === 'scheduled')!
  const postponed = ctx.tournaments.find((t) => t.kind === 'postponed')!
  const leaderPlayers = scoreResult.liveScenario.leaderIds
  const cutlinePlayers = scoreResult.liveScenario.cutlineIds

  type NType = 'emergency' | 'player_event' | 'start_reminder' | 'title_race' | 'news' | 'cut_line'
  const plans: { type: NType; title: string; body: string; tournament?: number; player?: number }[] = []

  // emergency (荒天中止・順延)
  plans.push(
    { type: 'emergency', title: `【中止】${ctx.tournaments.find((t) => t.kind === 'cancelled')!.name}`, body: '荒天のため大会が中止となりました。' },
    { type: 'emergency', title: `【順延】${postponed.name}`, body: '悪天候のためラウンドが順延されました。' },
    { type: 'emergency', title: '雷注意報発令', body: `${live.name}会場付近で落雷の危険があります。安全な場所へ避難してください。` },
    { type: 'emergency', title: '大会運営からのお知らせ', body: 'ギャラリー入場を一時規制しています。' },
    { type: 'emergency', title: 'プレー中断のお知らせ', body: '天候悪化のため一時プレーを中断しました。' },
  )
  // player_event（バーディ・イーグル等）
  for (let i = 0; i < 5; i++) {
    const pid = leaderPlayers[i % leaderPlayers.length]
    plans.push({
      type: 'player_event',
      title: 'バーディ獲得！',
      body: `お気に入り選手がバーディを獲得しました。`,
      tournament: live.id,
      player: pid,
    })
  }
  // start_reminder
  for (let i = 0; i < 5; i++) {
    plans.push({
      type: 'start_reminder',
      title: 'まもなくスタートです',
      body: `お気に入り選手のスタート時刻まで残り${[30, 15, 30, 15, 30][i]}分です。`,
      tournament: i % 2 === 0 ? live.id : scheduled.id,
      player: cutlinePlayers[i % cutlinePlayers.length],
    })
  }
  // title_race
  for (let i = 0; i < 5; i++) {
    plans.push({
      type: 'title_race',
      title: '優勝争いが白熱！',
      body: '首位争いが 2 打差以内の接戦になっています。',
      tournament: live.id,
      player: leaderPlayers[i % leaderPlayers.length],
    })
  }
  // news
  for (let i = 0; i < 5; i++) {
    plans.push({ type: 'news', title: `最新ニュース (${i + 1})`, body: '新着ニュースが公開されました。', tournament: live.id })
  }
  // cut_line
  for (let i = 0; i < 5; i++) {
    plans.push({
      type: 'cut_line',
      title: i < 4 ? 'カットライン ちょうど' : 'カット通過確定',
      body: i < 4 ? 'カットラインちょうどの位置にいます。' : '予選通過が確定しました。',
      tournament: live.id,
      player: cutlinePlayers[i % cutlinePlayers.length],
    })
  }

  const readerPool = [users.ids.fan1, users.ids.fan2, users.ids.fan4]
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]!
    const isLastOfType = i % 5 === 4
    const sentAt = addMinutes(ctx.today, i * 17)
    await ctx.payload.create({
      collection: 'notifications',
      data: {
        type: p.type,
        title: p.title,
        body: p.body,
        deepLink: p.tournament ? `jtour://tournament/${p.tournament}` : undefined,
        tournament: p.tournament,
        player: p.player,
        audience: 'all',
        sentAt: iso(sentAt),
        // 各タイプ末尾の 1 件は未読のままにする（通知種別 6 種 × 未読 1 件 = 6 件 >= 5 件）
        readBy: isLastOfType ? [] : rng.sample(readerPool, rng.int(1, readerPool.length)),
        priority: p.type === 'emergency' ? 'high' : 'normal',
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'notifications')
  }
}

/* ------------------------------------------------------------------ *
 * 広告枠・広告クリエイティブ（要求 8-3, 8-5）
 * ------------------------------------------------------------------ */

const AD_SLOTS = [
  { key: 'home_top_banner', name: 'ホーム最上部バナー', format: 'banner' as const, size: '320x100' },
  { key: 'home_inline', name: 'ホームインフィード', format: 'banner' as const, size: '320x100' },
  { key: 'leaderboard_inline', name: 'リーダーボード挿入枠（10行毎）', format: 'banner' as const, size: '320x80' },
  { key: 'video_pre', name: '動画再生前CM', format: 'video' as const, size: '16:9' },
  { key: 'tournament_detail_banner', name: '大会詳細タイアップ', format: 'tieup_article' as const, size: '記事形式' },
]

export const seedAds = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('ads')
  const slotIds: number[] = []
  for (const s of AD_SLOTS) {
    const doc = await ctx.payload.create({
      collection: 'ad-slots',
      data: { key: s.key, name: s.name, format: s.format, size: s.size },
      overrideAccess: true,
      depth: 0,
    })
    slotIds.push(doc.id as number)
    bump(ctx, 'ad-slots')
  }

  const newsForTieup = await ctx.payload.find({ collection: 'news', limit: 5, depth: 0, overrideAccess: true })

  let created = 0
  // 各枠に最低 1 件の有効クリエイティブを保証しつつ 20 件まで生成
  for (let i = 0; i < 20; i++) {
    const slotIndex = i < AD_SLOTS.length ? i : rng.int(0, AD_SLOTS.length - 1)
    const slot = AD_SLOTS[slotIndex]!
    const slotId = slotIds[slotIndex]!
    const sponsor = rng.pick(ctx.sponsors)
    const image =
      slot.format === 'banner'
        ? await uploadSvg({
            payload: ctx.payload,
            key: `ad-${slot.key}-${i}`,
            filename: `ad-${slot.key}-${i}.png`,
            svg: svgCard(640, 200, colorFor(`ad-${slot.key}-${i}`, { s: 65, l: 42 }), [{ text: sponsor.name, size: 32 }]),
            alt: `${sponsor.name} 広告`,
          })
        : undefined
    // 補-8-3-3: format=video のクリエイティブは実在の動画を紐付ける（video_pre 枠で /api/ads/serve が
    // 再生可能な video を返せるようにする）。ctx.videoIds は run.ts で seedVideos 実行後にセットされる
    const video = slot.format === 'video' && ctx.videoIds.length ? rng.pick(ctx.videoIds) : undefined
    const tournamentTarget = i % 4 === 0 ? rng.pick(ctx.tournaments).id : undefined
    const playerTarget = i % 5 === 0 ? rng.pick(ctx.players).id : undefined
    await ctx.payload.create({
      collection: 'ad-creatives',
      data: {
        name: `${sponsor.name} - ${slot.name} (${i + 1})`,
        sponsor: sponsor.id,
        slot: slotId,
        tournament: tournamentTarget,
        player: playerTarget,
        image,
        video,
        article: slot.format === 'tieup_article' ? newsForTieup.docs[i % newsForTieup.docs.length]?.id : undefined,
        linkUrl: `https://example.com/sponsors/${sponsor.id}`,
        weight: rng.int(1, 5),
        startAt: iso(addDays(ctx.today, -30)),
        endAt: iso(addDays(ctx.today, 60)),
        isActive: true,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'ad-creatives')
    created++
  }
  void created
}

/* ------------------------------------------------------------------ *
 * 計測イベント（要求 8-4, 8-6, 8-7・過去30日分 500件）
 * ------------------------------------------------------------------ */

export const seedAnalyticsEvents = async (ctx: SeedCtx, users: UsersSeedResult): Promise<void> => {
  const rng = streamFor('analytics-events')
  const EVENT_NAMES = [
    'screen_view',
    'impression',
    'click',
    'video_start',
    'video_progress',
    'video_complete',
    'share',
  ] as const
  const SCREENS = ['Home', 'Leaderboard', 'TournamentDetail', 'PlayerDetail', 'VideoDetail', 'News', 'MyPage']
  const videos = await ctx.payload.find({ collection: 'videos', limit: 60, depth: 0, overrideAccess: true })
  const adCreatives = await ctx.payload.find({ collection: 'ad-creatives', limit: 20, depth: 0, overrideAccess: true })
  const fanUserIds = [users.ids.fan1, users.ids.fan2, users.ids.fan3, users.ids.fan4]

  for (let i = 0; i < 500; i++) {
    const eventName = rng.pick(EVENT_NAMES)
    const occurredAt = addMinutes(ctx.today, -rng.int(0, 30 * 24 * 60))
    const isGuest = rng.bool(0.4)
    const isVideoEvent = eventName.startsWith('video_')
    const isAdEvent = eventName === 'impression' || eventName === 'click'
    await ctx.payload.create({
      collection: 'analytics-events',
      data: {
        eventName,
        occurredAt: iso(occurredAt),
        userId: isGuest ? undefined : rng.pick(fanUserIds),
        deviceId: isGuest ? `seed-analytics-device-${rng.int(1, 50)}` : undefined,
        screen: rng.pick(SCREENS),
        adCreative: isAdEvent && adCreatives.docs.length ? rng.pick(adCreatives.docs).id : undefined,
        video: isVideoEvent && videos.docs.length ? rng.pick(videos.docs).id : undefined,
        durationSec: isVideoEvent ? rng.int(3, 180) : undefined,
        props: isVideoEvent ? { progressPercent: rng.pick([25, 50, 75, 100]) } : {},
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'analytics-events')
  }
}

/* ------------------------------------------------------------------ *
 * グローバル設定
 * ------------------------------------------------------------------ */

export const seedGlobals = async (ctx: SeedCtx): Promise<void> => {
  await ctx.payload.updateGlobal({
    slug: 'legal-documents',
    data: {
      terms: rich({ h: '利用規約' }, 'これはテストデータ用の利用規約です。実運用時に正式な内容へ差し替えてください。'),
      privacy: rich({ h: 'プライバシーポリシー' }, 'これはテストデータ用のプライバシーポリシーです。'),
      version: '1.0',
      effectiveAt: iso(ctx.today),
    },
    overrideAccess: true,
    depth: 0,
  })

  await ctx.payload.updateGlobal({
    slug: 'app-settings',
    data: {
      liveScorePollIntervalSec: 15,
      favoritePlayerLimit: 10,
      lowBandwidthThresholdKbps: 300,
      offlineCacheTtlHours: 24,
      goodScoreToPar: -4,
      maintenanceMode: false,
      minimumAppVersion: '1.0.0',
    },
    overrideAccess: true,
    depth: 0,
  })
}
