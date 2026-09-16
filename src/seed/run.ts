/**
 * seed オーケストレーター（EP-03 T-03-12）
 *
 * 実行: `pnpm seed`（追記）/ `pnpm seed:reset`（DB 初期化後に投入）
 * 乱数は SEED（既定 20260915）で決定的に生成する（rng.ts）。
 */
import { getPayload } from 'payload'

import config from '../payload.config'
import { printChecklist, runChecklist } from './checklist'
import type { SeedCtx } from './context'
import { seedNews, seedGuideArticles, seedGlossaryTerms, seedFaqs, seedOnboardingSlides, seedPlayerStories, seedHighlightReels, seedPlaylists } from './content'
import { ensureTmpDir } from './media'
import { seedPlayers, seedSeasons, seedSponsors, seedVenues, VENUE_SEEDS } from './masters'
import { seedAds, seedAnalyticsEvents, seedGlobals, seedNotifications, seedPlayerPositions } from './ops'
import { seedHoleStatistics, seedRankings } from './rankings'
import { seedScores } from './scores'
import { seedShots } from './shots'
import {
  LIVE_CODE,
  seedLiveStreams,
  seedPairings,
  seedTicketTypes,
  seedTournaments,
  seedTransportInfos,
  seedVenueFacilities,
  seedWeatherForecasts,
} from './tournaments'
import { seedUsers } from './users'
import { anchorDate } from './util'
import { seedVideos } from './videos'

const main = async (): Promise<void> => {
  const start = Date.now()
  ensureTmpDir()

  const payload = await getPayload({ config })

  const ctx: SeedCtx = {
    payload,
    today: anchorDate(),
    seasons: [],
    venues: [],
    players: [],
    sponsors: [],
    tournaments: [],
    videoIds: [],
    shotVideoIds: [],
    mediaIds: { genericPhotos: [] },
    users: {},
    counts: {},
  }

  console.log(`[seed] SEED=${process.env.SEED ?? 20260915} today=${ctx.today.toISOString()}`)

  console.log('[seed] 1/9 マスタ（シーズン・会場・コース・ホール・スポンサー・選手）...')
  await seedSeasons(ctx)
  await seedVenues(ctx, VENUE_SEEDS[0]!.slug) // 開催中大会の会場（LIVE_CODE の venueIndex:0 と対応）
  await seedSponsors(ctx)
  await seedPlayers(ctx)

  console.log('[seed] 2/9 大会・ラウンド...')
  await seedTournaments(ctx)

  console.log('[seed] 3/9 スコア（開催中大会シナリオを含む）...')
  const scoreResult = await seedScores(ctx)

  console.log('[seed] 4/9 組み合わせ...')
  await seedPairings(ctx, scoreResult.cutFieldByTournament)

  console.log('[seed] 5/9 ショット（数分かかります）...')
  const shotResult = await seedShots(ctx, scoreResult)
  console.log(`[seed]      ショット生成数: ${shotResult.totalShots}`)

  console.log('[seed] 6/9 動画（ショット/ハイライト/縦型/選手ストーリー）...')
  const videoResult = await seedVideos(ctx, shotResult)
  ctx.shotVideoIds = videoResult.shotVideoIds
  ctx.videoIds = [
    ...videoResult.shotVideoIds,
    ...videoResult.highlightVideoIds,
    ...videoResult.verticalVideoIds,
    ...videoResult.playerStoryVideoIds,
  ]

  console.log('[seed] 7/9 会場付随情報・チケット・ランキング・コンテンツ...')
  await seedVenueFacilities(ctx)
  await seedTransportInfos(ctx)
  await seedWeatherForecasts(ctx)
  const ticketTypeIds = await seedTicketTypes(ctx)
  await seedLiveStreams(ctx, videoResult.highlightVideoIds[0])
  await seedRankings(ctx)
  await seedHoleStatistics(ctx)
  await seedNews(ctx)
  await seedGuideArticles(ctx)
  await seedGlossaryTerms(ctx)
  await seedFaqs(ctx)
  await seedOnboardingSlides(ctx)
  await seedPlayerStories(ctx, videoResult)
  await seedHighlightReels(ctx, videoResult)

  console.log('[seed] 8/9 ユーザー・お気に入り・通知・広告・計測...')
  const users = await seedUsers(ctx, ticketTypeIds)
  await seedPlaylists(ctx, videoResult, users.ids.fan1)
  await seedPlayerPositions(ctx, scoreResult)
  await seedNotifications(ctx, scoreResult, users)
  await seedAds(ctx)
  await seedAnalyticsEvents(ctx, users)
  await seedGlobals(ctx)

  console.log('[seed] 9/9 検証...')
  const checklist = await runChecklist(ctx, scoreResult)

  const elapsedSec = Math.round((Date.now() - start) / 1000)
  console.log('\n=== seed 完了サマリ ===')
  console.log(`所要時間: ${elapsedSec}秒`)
  const liveT = ctx.tournaments.find((t) => t.code === LIVE_CODE)!
  console.log(`開催中大会: ${liveT.name} (${liveT.code}) / venue=${liveT.venue.name}`)
  console.log(`優勝争い候補選手ID: ${scoreResult.liveScenario.leaderIds.join(', ')}`)
  console.log(`カットライン選手ID: ${scoreResult.liveScenario.cutlineIds.join(', ')} (cutline toPar=${scoreResult.liveScenario.cutlineToPar})`)
  console.log(`ホールインワン: player=${scoreResult.liveScenario.holeInOne.playerId} hole=${scoreResult.liveScenario.holeInOne.hole}`)
  console.log('\n件数:')
  const sortedCounts = Object.entries(ctx.counts).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [k, v] of sortedCounts) console.log(`  ${k}: ${v}`)

  printChecklist(checklist)

  const failedCount = checklist.filter((c) => !c.pass).length
  if (failedCount > 0) {
    console.error(`\n[seed] ${failedCount} 件のチェックが FAIL しています。上記ログを確認してください。`)
    process.exitCode = 1
  } else {
    console.log('\n[seed] すべてのチェックに PASS しました。')
  }

  await payload.destroy()
}

main().catch((err) => {
  console.error('[seed] 失敗しました:', err)
  process.exit(1)
})
