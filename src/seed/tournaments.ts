/**
 * 大会・ラウンド・組み合わせ・会場付随データ
 *
 * 06-test-data.md 2章の「開催中の大会」を seed 実行日の 3 日目（最終ラウンド）として構成する。
 */
import type { RoundRef, SeedCtx, TournamentKind, TournamentRef } from './context'
import { bump } from './context'
import { colorFor, svgCard, uploadPdf, uploadSvg } from './media'
import { streamFor } from './rng'
import { addDays, addHours, addMinutes, destPoint, iso, pad, rich } from './util'

/** 出場選手数（1R あたり 24 組 = 補-1-8-2 の「20〜25 組」に収まる） */
export const FIELD_SIZE = 72
/** 予選通過人数 */
export const CUT_SIZE = 45
/** 開催中大会のコード（06-test-data.md 2章） */
export const LIVE_CODE = 'T-2026-08'

type TournamentSeed = {
  code: string
  name: string
  kind: TournamentKind
  venueIndex: number
  /** 最終日が今日から何日前か（負なら未来） */
  endOffsetDays: number
  roundCount: number
  prize: number
  seasonOffset: -1 | 0
}

export const TOURNAMENT_SEEDS: TournamentSeed[] = [
  // --- 前シーズン（終了）
  { code: 'T-2025-01', name: '春陽オープン', kind: 'finished', venueIndex: 1, endOffsetDays: 430, roundCount: 4, prize: 120_000_000, seasonOffset: -1 },
  { code: 'T-2025-02', name: 'ニホンリンクス選手権', kind: 'finished', venueIndex: 2, endOffsetDays: 380, roundCount: 4, prize: 150_000_000, seasonOffset: -1 },
  { code: 'T-2025-03', name: '秋涼カップ', kind: 'finished', venueIndex: 3, endOffsetDays: 330, roundCount: 4, prize: 100_000_000, seasonOffset: -1 },
  // --- 現行シーズン
  { code: 'T-2026-03', name: '早春チャレンジトーナメント', kind: 'cancelled', venueIndex: 4, endOffsetDays: 160, roundCount: 1, prize: 80_000_000, seasonOffset: 0 },
  { code: 'T-2026-04', name: '新緑クラシック', kind: 'postponed', venueIndex: 5, endOffsetDays: 120, roundCount: 4, prize: 110_000_000, seasonOffset: 0 },
  { code: 'T-2026-05', name: '架空ホールディングス招待', kind: 'finished', venueIndex: 1, endOffsetDays: 70, roundCount: 4, prize: 200_000_000, seasonOffset: 0 },
  { code: 'T-2026-06', name: 'サンライズ自動車オープン', kind: 'finished', venueIndex: 2, endOffsetDays: 49, roundCount: 4, prize: 130_000_000, seasonOffset: 0 },
  { code: 'T-2026-07', name: 'グリーンベイ銀行トーナメント', kind: 'finished', venueIndex: 3, endOffsetDays: 28, roundCount: 4, prize: 140_000_000, seasonOffset: 0 },
  { code: LIVE_CODE, name: 'J-TOUR チャンピオンシップ', kind: 'live', venueIndex: 0, endOffsetDays: 0, roundCount: 3, prize: 300_000_000, seasonOffset: 0 },
  { code: 'T-2026-09', name: 'ミライ電機カップ', kind: 'scheduled', venueIndex: 5, endOffsetDays: -24, roundCount: 4, prize: 120_000_000, seasonOffset: 0 },
]

const STATUS_OF: Record<TournamentKind, TournamentRef['status']> = {
  finished: 'finished',
  live: 'live',
  scheduled: 'scheduled',
  cancelled: 'cancelled',
  postponed: 'postponed',
}

/** ラウンドごとの status を決める */
const roundStatus = (kind: TournamentKind, n: number, total: number): RoundRef['status'] => {
  switch (kind) {
    case 'finished':
      return 'finished'
    case 'live':
      return n < total ? 'finished' : 'live'
    case 'scheduled':
      return 'scheduled'
    case 'cancelled':
      return 'suspended'
    case 'postponed':
      // R1 は消化済み、R2 で中断（= 順延）、R3 以降は未実施
      return n === 1 ? 'finished' : n === 2 ? 'suspended' : 'scheduled'
  }
}

export const seedTournaments = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('tournaments')

  for (const ts of TOURNAMENT_SEEDS) {
    const venue = ctx.venues[ts.venueIndex]!
    const season = ctx.seasons.find((s) => s.year === ctx.today.getUTCFullYear() + ts.seasonOffset)!
    const endDate = addDays(ctx.today, -ts.endOffsetDays)
    const startDate = addDays(endDate, -(ts.roundCount - 1))
    const slug = ts.code.toLowerCase()

    const hero = await uploadSvg({
      payload: ctx.payload,
      key: `tournament-hero-${ts.code}`,
      filename: `tournament-${slug}.png`,
      svg: svgCard(
        1600,
        900,
        colorFor(`tournament-${ts.code}`, { s: 52, l: 33 }),
        [
          { text: ts.name, size: 82 },
          { text: venue.name, size: 40, weight: 500, opacity: 0.9 },
        ],
        { corner: ts.code },
      ),
      alt: `${ts.name} ヒーロー画像`,
      caption: '補-1-8-1 大会詳細ヘッダー',
    })

    // パンフレット PDF は開催中大会のみ（4 ページのダミー）
    const pamphlet =
      ts.kind === 'live'
        ? await uploadPdf(
            ctx.payload,
            'pamphlet-live',
            'pamphlet-live.pdf',
            'J-TOUR CHAMPIONSHIP OFFICIAL PAMPHLET',
            [
              'Tournament outline and schedule.',
              'Course guide: 18 holes, par 72.',
              'Venue map and facilities.',
              'Access, shuttle bus and parking.',
            ],
            `${ts.name} 公式パンフレット`,
          )
        : undefined

    const doc = await ctx.payload.create({
      collection: 'tournaments',
      data: {
        name: ts.name,
        slug,
        season: season.id,
        venue: venue.id,
        course: venue.course.id,
        startDate: iso(startDate),
        endDate: iso(endDate),
        prizeMoneyTotal: ts.prize,
        status: STATUS_OF[ts.kind],
        heroImage: hero,
        description: rich(
          `${ts.name}は${venue.name}（${venue.course.name}・パー 72）で開催される${ts.roundCount}日間競技です。`,
          `賞金総額 ${ts.prize.toLocaleString('en-US')} 円。${
            ts.kind === 'cancelled'
              ? '荒天のため中止となりました。'
              : ts.kind === 'postponed'
                ? '悪天候により順延しています。'
                : ts.kind === 'scheduled'
                  ? '開幕に向けて準備が進んでいます。'
                  : '熱戦が繰り広げられました。'
          }`,
        ),
        pamphletPdf: pamphlet,
        pamphletWebUrl: `https://example.com/tournaments/${slug}/pamphlet`,
        officialStoreUrl: `https://example.com/store/${slug}`,
        ticketUrl: `https://example.com/tickets/${slug}`,
        cutLineAfterRound: 2,
        cutRule: '2 ラウンド終了時点で上位 45 位タイまでが予選通過',
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'tournaments')

    // ---- ラウンド
    const rounds: RoundRef[] = []
    for (let n = 1; n <= ts.roundCount; n++) {
      const date = addDays(startDate, n - 1)
      const status = roundStatus(ts.kind, n, ts.roundCount)
      const rd = await ctx.payload.create({
        collection: 'rounds',
        data: {
          tournament: doc.id as number,
          number: n,
          date: iso(date),
          status,
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'rounds')
      rounds.push({ id: rd.id as number, number: n, date, status })
    }

    // ---- 出場選手（スター選手を必ず含める）
    const trng = rng.child(`field-${ts.code}`)
    const stars = ctx.players.filter((p) => p.isStar)
    const rest = trng.shuffle(ctx.players.filter((p) => !p.isStar)).slice(0, FIELD_SIZE - stars.length)
    const field = [...stars, ...rest]

    ctx.tournaments.push({
      id: doc.id as number,
      code: ts.code,
      slug,
      name: ts.name,
      kind: ts.kind,
      status: STATUS_OF[ts.kind],
      seasonId: season.id,
      venue,
      startDate,
      endDate,
      rounds,
      field,
      cutLineAfterRound: 2,
    } satisfies TournamentRef)
  }
}

/* ------------------------------------------------------------------ *
 * 組み合わせ（補-1-8-2。1R あたり 20〜25 組・1 組 3 名）
 * ------------------------------------------------------------------ */

/** ラウンドごとに組み合わせを作る対象を返す */
const pairingRounds = (t: TournamentRef): RoundRef[] => {
  switch (t.kind) {
    case 'finished':
      return t.rounds
    case 'live':
      return t.rounds
    case 'postponed':
      return t.rounds.filter((r) => r.number <= 2)
    case 'cancelled':
    case 'scheduled':
      return t.rounds.filter((r) => r.number === 1)
  }
}

export const seedPairings = async (
  ctx: SeedCtx,
  cutFieldByTournament: Map<string, number[]>,
): Promise<void> => {
  const rng = streamFor('pairings')

  for (const t of ctx.tournaments) {
    for (const round of pairingRounds(t)) {
      const afterCut = round.number > t.cutLineAfterRound
      const ids = afterCut
        ? (cutFieldByTournament.get(t.code) ?? t.field.slice(0, CUT_SIZE).map((p) => p.id))
        : t.field.map((p) => p.id)
      const ordered = rng.child(`${t.code}-r${round.number}`).shuffle(ids)
      const groups: number[][] = []
      for (let i = 0; i < ordered.length; i += 3) groups.push(ordered.slice(i, i + 3))

      for (let gi = 0; gi < groups.length; gi++) {
        // アウト / イン のスタート振り分け（後半組は 10 番スタート）
        const startHole = !afterCut && gi >= Math.ceil(groups.length / 2) ? 10 : 1
        const seq = startHole === 1 ? gi : gi - Math.ceil(groups.length / 2)
        const base = addHours(round.date, 7) // 07:00 スタート
        const startTime = addMinutes(base, seq * 10)
        await ctx.payload.create({
          collection: 'pairings',
          data: {
            round: round.id,
            groupNo: gi + 1,
            startTime: iso(startTime),
            startHole,
            players: groups[gi] as number[],
          },
          overrideAccess: true,
          depth: 0,
        })
        bump(ctx, 'pairings')
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 会場施設（補-1-22-1 の 8 種別）
 * ------------------------------------------------------------------ */

const FACILITY_TYPES = [
  'toilet',
  'food',
  'goods',
  'firstaid',
  'entrance',
  'info',
  'smoking',
  'atm',
] as const

const FACILITY_LABEL: Record<(typeof FACILITY_TYPES)[number], string> = {
  toilet: '仮設トイレ',
  food: 'フードコート',
  goods: 'オフィシャルグッズショップ',
  firstaid: '救護所',
  entrance: '入場ゲート',
  info: '総合案内所',
  smoking: '喫煙所',
  atm: 'ATM コーナー',
}

const MENU_SAMPLES = [
  { name: 'バーディカレー', price: 900 },
  { name: 'ホールインワン丼', price: 1200 },
  { name: 'グリーンサラダ', price: 600 },
  { name: 'アルバトロスバーガー', price: 1000 },
  { name: '会場限定ロゴキャップ', price: 3800 },
  { name: 'ツアーボール 3 球入り', price: 2400 },
]

export const seedVenueFacilities = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('facilities')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!

  const photoFor = async (type: (typeof FACILITY_TYPES)[number]) =>
    uploadSvg({
      payload: ctx.payload,
      key: `facility-${type}`,
      filename: `facility-${type}.png`,
      svg: svgCard(960, 640, colorFor(`facility-${type}`, { s: 48, l: 38 }), [
        { text: FACILITY_LABEL[type], size: 56 },
      ]),
      alt: `${FACILITY_LABEL[type]} 写真`,
    })

  for (const venue of ctx.venues) {
    const isLiveVenue = venue.id === live.venue.id
    // 開催中大会の会場は 8 種別すべて × 30 件、その他は 10 件
    const count = isLiveVenue ? 30 : 10
    const vr = rng.child(`venue-${venue.slug}`)

    for (let i = 0; i < count; i++) {
      const type = isLiveVenue
        ? (FACILITY_TYPES[i % FACILITY_TYPES.length] as (typeof FACILITY_TYPES)[number])
        : (FACILITY_TYPES[i % 6] as (typeof FACILITY_TYPES)[number])
      // 会場バウンディングボックス内にピンを収める（06-test-data.md 3章）
      const loc = destPoint(venue.center, vr.float(0, 360), vr.float(60, 620))
      const isFood = type === 'food' || type === 'goods'
      await ctx.payload.create({
        collection: 'venue-facilities',
        data: {
          venue: venue.id,
          tournament: isLiveVenue && i % 3 === 0 ? live.id : undefined,
          type,
          name: `${FACILITY_LABEL[type]} ${pad(Math.floor(i / FACILITY_TYPES.length) + 1)}`,
          location: { lat: loc.lat, lng: loc.lng },
          description: `${venue.name}内の${FACILITY_LABEL[type]}です。会場マップのピンから案内します。`,
          photo: await photoFor(type),
          menuItems: isFood
            ? vr.sample(MENU_SAMPLES, 3).map((m) => ({ name: m.name, price: m.price }))
            : [],
          openHours: '07:00 - 18:00',
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'venue-facilities')
    }
  }
}

/* ------------------------------------------------------------------ *
 * 交通情報（ギャラリーバス 8 / 駐車場 8 / シャトル 4 = 20 件）
 * ------------------------------------------------------------------ */

export const seedTransportInfos = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('transport')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const others = ctx.tournaments.filter((t) => t.kind !== 'live')

  const plan: { type: 'gallery_bus' | 'parking' | 'shuttle'; count: number }[] = [
    { type: 'gallery_bus', count: 8 },
    { type: 'parking', count: 8 },
    { type: 'shuttle', count: 4 },
  ]

  for (const { type, count } of plan) {
    for (let i = 0; i < count; i++) {
      // 半分は開催中大会に、残りは他大会に割り当てる
      const t = i < Math.ceil(count / 2) ? live : (others[i % others.length] as TournamentRef)
      const r = rng.child(`${type}-${i}`)
      const loc = destPoint(t.venue.center, r.float(0, 360), r.float(120, 680))
      const labels = {
        gallery_bus: 'ギャラリーバス乗降場',
        parking: '臨時駐車場',
        shuttle: 'シャトルバス',
      } as const
      await ctx.payload.create({
        collection: 'transport-infos',
        data: {
          tournament: t.id,
          type,
          name: `${labels[type]} ${String.fromCharCode(65 + i)}`,
          location: { lat: loc.lat, lng: loc.lng },
          timetable:
            type === 'parking'
              ? []
              : Array.from({ length: 6 }, (_, k) => ({
                  time: `${pad(7 + k)}:${k % 2 === 0 ? '00' : '30'}`,
                  note: k === 0 ? '始発' : k === 5 ? '最終' : undefined,
                })),
          capacity: type === 'parking' ? r.int(120, 900) : undefined,
          occupancyStatus:
            type === 'parking' ? r.weighted([['vacant', 3], ['crowded', 2], ['full', 1]] as const) : undefined,
          fee: type === 'parking' ? '1 日 2,000 円' : '片道 400 円',
          note: rich(
            type === 'parking'
              ? '満車の場合は係員の誘導に従って第 2 駐車場をご利用ください。'
              : '大会期間中のみの運行です。混雑時は増便します。',
          ),
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'transport-infos')
    }
  }
}

/* ------------------------------------------------------------------ *
 * 天気予報（開催中大会の 1 時間毎 × 72 時間）
 * ------------------------------------------------------------------ */

const CONDITIONS = [
  'sunny',
  'partly_cloudy',
  'cloudy',
  'rain',
  'heavy_rain',
  'thunder',
  'snow',
  'fog',
] as const
const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export const seedWeatherForecasts = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('weather')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const observedAt = iso(addHours(ctx.today, 5))

  for (let h = 0; h < 72; h++) {
    const at = addHours(ctx.today, h)
    const hourOfDay = at.getUTCHours()
    // 8 種の condition がすべて出るように最初の 8 時間で一巡させる
    const condition =
      h < 8
        ? (CONDITIONS[h] as (typeof CONDITIONS)[number])
        : rng.weighted([
            ['sunny', 5],
            ['partly_cloudy', 4],
            ['cloudy', 3],
            ['rain', 2],
            ['heavy_rain', 1],
            ['thunder', 1],
            ['fog', 1],
          ] as const)
    await ctx.payload.create({
      collection: 'weather-forecasts',
      data: {
        tournament: live.id,
        observedAt,
        forecastFor: iso(at),
        condition,
        temperature: Math.round((20 + Math.sin((hourOfDay / 24) * Math.PI * 2) * 6 + rng.float(-1.5, 1.5)) * 10) / 10,
        windSpeed: Math.round(rng.float(0.5, 9.5) * 10) / 10,
        windDirection: rng.pick(WIND_DIRS),
        precipProbability: condition.includes('rain') || condition === 'thunder' ? rng.int(50, 95) : rng.int(0, 40),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'weather-forecasts')
  }
}

/* ------------------------------------------------------------------ *
 * チケット券種（大会あたり 2〜3 種 / 計 12）
 * ------------------------------------------------------------------ */

export const seedTicketTypes = async (ctx: SeedCtx): Promise<number[]> => {
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const scheduled = ctx.tournaments.find((t) => t.kind === 'scheduled')!
  const finished = ctx.tournaments.filter((t) => t.kind === 'finished').slice(0, 3)

  const plan: { t: TournamentRef; names: string[] }[] = [
    { t: live, names: ['1 日券（最終日）', '通し券', '駐車券'] },
    { t: scheduled, names: ['前売 1 日券', '通し券', '駐車券'] },
    ...finished.map((t) => ({ t, names: ['1 日券', '通し券'] })),
  ]

  const ids: number[] = []
  for (const { t, names } of plan) {
    for (let i = 0; i < names.length; i++) {
      const name = names[i] as string
      const price = name.includes('駐車') ? 3000 : name.includes('通し') ? 12000 : 5000
      const doc = await ctx.payload.create({
        collection: 'ticket-types',
        data: {
          tournament: t.id,
          name,
          price,
          validDate: iso(t.kind === 'live' ? ctx.today : t.startDate),
          // 補-5-1-3: 在庫 0 の券種も 1 件用意して購入不可表示を確認できるようにする
          stock: t.kind === 'live' && i === 2 ? 0 : 200 + i * 150,
          salesStart: iso(addDays(t.startDate, -60)),
          salesEnd: iso(addDays(t.endDate, -1)),
        },
        overrideAccess: true,
        depth: 0,
      })
      ids.push(doc.id as number)
      bump(ctx, 'ticket-types')
    }
  }
  return ids
}

/* ------------------------------------------------------------------ *
 * ライブ配信枠（2-1 / 2-2）
 * ------------------------------------------------------------------ */

export const seedLiveStreams = async (ctx: SeedCtx, archiveVideoId?: number): Promise<void> => {
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const finished = ctx.tournaments.find((t) => t.kind === 'finished')!

  const rows = [
    {
      title: '練習場ライブ（固定カメラ）',
      tournament: live.id,
      kind: 'practice_range' as const,
      status: 'live' as const,
      delaySec: 120,
      startedAt: iso(addHours(ctx.today, 6)),
    },
    {
      title: 'フィーチャードグループ 最終日',
      tournament: live.id,
      kind: 'featured_group' as const,
      status: 'live' as const,
      delaySec: 900,
      startedAt: iso(addHours(ctx.today, 7)),
    },
    {
      title: '公式インスタライブ（大会前日）',
      tournament: live.id,
      kind: 'instagram_live' as const,
      status: 'scheduled' as const,
      delaySec: 0,
    },
    {
      title: `${finished.name} 最終日アーカイブ`,
      tournament: finished.id,
      kind: 'featured_group' as const,
      status: 'ended' as const,
      delaySec: 7200,
      startedAt: iso(addHours(finished.endDate, 7)),
      endedAt: iso(addHours(finished.endDate, 13)),
    },
  ]

  for (const r of rows) {
    await ctx.payload.create({
      collection: 'live-streams',
      data: {
        ...r,
        streamUrl: `https://mock.jtour.example/live/${r.kind}.m3u8`,
        archiveVideo: r.status === 'ended' ? archiveVideoId : undefined,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'live-streams')
  }
}
