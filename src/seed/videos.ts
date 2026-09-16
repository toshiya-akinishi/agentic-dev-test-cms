/**
 * 動画（要求 2-8〜2-15, 2-21, 2-22）
 *
 * ショット 70 / ハイライト 20 / 縦型ストーリー 20 / 選手ストーリー 10 = 120 本。
 * 動画本体ファイルは実エンコードせず、`hlsUrl` にモック URL を格納する
 * （既存の live-streams と同じ方針。詳細は最終レポートの逸脱事項を参照）。
 * サムネイルのみ実際に生成する（外部ネットワーク非依存）。
 */
import type { SeedCtx } from './context'
import { bump } from './context'
import { colorFor, svgCard, uploadSvg } from './media'
import { streamFor } from './rng'
import type { ShotSeedResult, ShotSummary } from './shots'
import { addDays, iso, pad } from './util'
import { computeAutoTags, type VideoTag } from '../lib/autoTag'

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000)

export type VideoSeedResult = {
  shotVideoIds: number[]
  highlightVideoIds: number[]
  verticalVideoIds: number[]
  playerStoryVideoIds: number[]
  tagsUsed: Set<VideoTag>
  holeInOneVideoId?: number
}

const tagsFor = (s: ShotSummary): VideoTag[] =>
  computeAutoTags({
    shotType: s.shotType,
    holePar: s.holePar,
    holeResult: s.holeResult,
    strokesOnHole: s.strokesOnHole,
    distanceYards: s.distanceYards,
    remainingYards: s.remainingYards,
  })

export const seedVideos = async (ctx: SeedCtx, shotResult: ShotSeedResult): Promise<VideoSeedResult> => {
  const rng = streamFor('videos')
  const tagsUsed = new Set<VideoTag>()
  const shotVideoIds: number[] = []
  const highlightVideoIds: number[] = []
  const verticalVideoIds: number[] = []
  const playerStoryVideoIds: number[] = []
  let holeInOneVideoId: number | undefined

  const playerById = new Map(ctx.players.map((p) => [p.id, p]))
  const tournamentByCode = new Map(ctx.tournaments.map((t) => [t.code, t]))

  // --- 70 本のショット動画を選定する。
  // まず 8 種タグそれぞれの条件を満たすショットを最低 1 本ずつ確保し、残りをランダム抽選する。
  const byTagCandidate = new Map<VideoTag, ShotSummary>()
  for (const s of shotResult.pool) {
    for (const tag of tagsFor(s)) {
      if (!byTagCandidate.has(tag)) byTagCandidate.set(tag, s)
    }
  }
  // ホールインワンは liveScenario で確定した 1 本を最優先で使う
  const aceShot = shotResult.pool.find((s) => s.id === shotResult.holeInOneShotId)
  if (aceShot) byTagCandidate.set('hole_in_one', aceShot)

  const selected = new Map<number, ShotSummary>()
  for (const s of byTagCandidate.values()) selected.set(s.id, s)
  const remainingPool = shotResult.pool.filter((s) => !selected.has(s.id))
  const extra = rng.sample(remainingPool, Math.max(0, 70 - selected.size))
  for (const s of extra) selected.set(s.id, s)
  const shotVideoTargets = [...selected.values()].slice(0, 70)

  for (let i = 0; i < shotVideoTargets.length; i++) {
    const s = shotVideoTargets[i]!
    const t = tournamentByCode.get(s.tournamentCode)!
    const player = playerById.get(s.playerId)!
    const tags = tagsFor(s)
    const slug = `shot-${s.tournamentCode.toLowerCase()}-r${s.roundNumber}-${player.slug}-h${pad(s.hole)}-${i}`
    const thumb = await uploadSvg({
      payload: ctx.payload,
      key: `video-thumb-${slug}`,
      filename: `${slug}.png`,
      svg: svgCard(1280, 720, colorFor(`shot-${slug}`, { s: 55, l: 32 }), [
        { text: `${s.hole}H ${player.name}`, size: 58 },
        { text: t.name, size: 32, weight: 500, opacity: 0.85 },
      ], { corner: tags.includes('hole_in_one') ? 'HOLE IN ONE' : s.shotType.toUpperCase() }),
      alt: `${player.name} ${s.hole}番ホール ショット動画サムネイル`,
    })
    const publishedAt = addMin(t.startDate, s.roundNumber * 300 + i)
    const doc = await ctx.payload.create({
      collection: 'videos',
      data: {
        title: `${player.name} ${s.hole}番ホール ${tags.includes('hole_in_one') ? 'ホールインワン！' : 'ショット'}`,
        slug,
        kind: 'shot',
        // 補-8-8-3: 公開 API（readPublished）から見えるよう明示的に公開ステータスで作成する。
        // versions.drafts 有効コレクションは _status 未指定だと 'draft' がデフォルトになるため注意
        // （T-12-8 / T-12-11 の検証で判明。node_modules/payload/dist/versions/baseFields.js 参照）
        _status: 'published',
        hlsUrl: `https://mock.jtour.example/videos/${slug}.m3u8`,
        thumbnail: thumb,
        durationSec: rng.int(5, 12),
        orientation: 'landscape',
        tournament: t.id,
        round: s.roundId,
        player: player.id,
        hole: s.hole,
        shotNo: 1,
        shotTime: iso(publishedAt),
        shotType: s.shotType,
        tags,
        autoTagged: true,
        publishedAt: iso(publishedAt),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'videos')
    shotVideoIds.push(doc.id as number)
    tags.forEach((tag) => tagsUsed.add(tag))
    if (tags.includes('hole_in_one')) holeInOneVideoId = doc.id as number

    // shots.video を逆参照で更新（1-38 / 3-8）
    await ctx.payload.update({ collection: 'shots', id: s.id, data: { video: doc.id }, overrideAccess: true, depth: 0 })
  }

  // --- ハイライト（20 本）: 大会単位、タグは複数付与
  const highlightSources = ctx.tournaments.filter((t) => t.kind === 'finished' || t.kind === 'live')
  for (let i = 0; i < 20; i++) {
    const t = highlightSources[i % highlightSources.length]!
    const slug = `highlight-${t.code.toLowerCase()}-${i}`
    const thumb = await uploadSvg({
      payload: ctx.payload,
      key: `video-thumb-${slug}`,
      filename: `${slug}.png`,
      svg: svgCard(1280, 720, colorFor(`hl-${slug}`, { s: 60, l: 30 }), [
        { text: `${t.name}`, size: 50 },
        { text: 'ハイライト', size: 34, weight: 500, opacity: 0.85 },
      ]),
      alt: `${t.name} ハイライト動画サムネイル`,
    })
    const tags: VideoTag[] = rng.sample(['eagle', 'birdie', 'nice_shot', 'approach', 'drive'] as const, rng.int(1, 3))
    const publishedAt = addMin(t.endDate, i * 45)
    const doc = await ctx.payload.create({
      collection: 'videos',
      data: {
        title: `${t.name} ダイジェスト ${i + 1}`,
        slug,
        kind: 'highlight',
        _status: 'published', // 補-8-8-3: 公開 API から見えるよう明示（詳細は上の shot 動画のコメント参照）
        hlsUrl: `https://mock.jtour.example/videos/${slug}.m3u8`,
        thumbnail: thumb,
        durationSec: rng.int(45, 120),
        orientation: 'landscape',
        tournament: t.id,
        tags,
        autoTagged: false,
        publishedAt: iso(publishedAt),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'videos')
    highlightVideoIds.push(doc.id as number)
    tags.forEach((tag) => tagsUsed.add(tag))
  }

  // --- 縦型ストーリー（20 本）
  for (let i = 0; i < 20; i++) {
    const t = ctx.tournaments[i % ctx.tournaments.length]!
    const player = ctx.players[i % ctx.players.length]!
    const slug = `story-${t.code.toLowerCase()}-${player.slug}-${i}`
    const thumb = await uploadSvg({
      payload: ctx.payload,
      key: `video-thumb-${slug}`,
      filename: `${slug}.png`,
      svg: svgCard(720, 1280, colorFor(`vs-${slug}`, { s: 58, l: 34 }), [
        { text: player.name, size: 54 },
        { text: t.name, size: 28, weight: 500, opacity: 0.85 },
      ]),
      alt: `${player.name} 縦型ストーリー サムネイル`,
    })
    const publishedAt = addMin(t.startDate, i * 20)
    const doc = await ctx.payload.create({
      collection: 'videos',
      data: {
        title: `${player.name} の見どころショート`,
        slug,
        kind: 'story_vertical',
        _status: 'published', // 補-8-8-3: 公開 API から見えるよう明示（詳細は上の shot 動画のコメント参照）
        hlsUrl: `https://mock.jtour.example/videos/${slug}.m3u8`,
        thumbnail: thumb,
        durationSec: rng.int(15, 60),
        orientation: 'portrait',
        tournament: t.id,
        player: player.id,
        tags: rng.sample(['nice_shot', 'birdie', 'drive', 'approach'] as const, rng.int(1, 2)),
        autoTagged: false,
        publishedAt: iso(publishedAt),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'videos')
    verticalVideoIds.push(doc.id as number)
  }

  // --- 選手ストーリー動画（10 本・スター選手から選出）
  const stars = ctx.players.filter((p) => p.isStar).slice(0, 10)
  for (let i = 0; i < stars.length; i++) {
    const player = stars[i]!
    const slug = `player-story-${player.slug}`
    const thumb = await uploadSvg({
      payload: ctx.payload,
      key: `video-thumb-${slug}`,
      filename: `${slug}.png`,
      svg: svgCard(1280, 720, colorFor(`ps-${slug}`, { s: 50, l: 30 }), [
        { text: player.name, size: 60 },
        { text: 'PLAYER STORY', size: 30, weight: 500, opacity: 0.85 },
      ]),
      alt: `${player.name} 選手ストーリー サムネイル`,
    })
    const publishedAt = addDays(ctx.today, -i)
    const doc = await ctx.payload.create({
      collection: 'videos',
      data: {
        title: `${player.name} インタビュー`,
        slug,
        kind: 'player_story',
        _status: 'published', // 補-8-8-3: 公開 API から見えるよう明示(詳細は上の shot 動画のコメント参照)
        hlsUrl: `https://mock.jtour.example/videos/${slug}.m3u8`,
        thumbnail: thumb,
        durationSec: rng.int(60, 180),
        orientation: 'landscape',
        player: player.id,
        tags: [],
        autoTagged: false,
        publishedAt: iso(publishedAt),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'videos')
    playerStoryVideoIds.push(doc.id as number)
  }

  return { shotVideoIds, highlightVideoIds, verticalVideoIds, playerStoryVideoIds, tagsUsed, holeInOneVideoId }
}
