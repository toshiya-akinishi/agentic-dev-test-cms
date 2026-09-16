/**
 * マスタ系（シーズン / 会場 / コース / ホール / 選手 / スポンサー）
 *
 * ホールの teeLocation / greenLocation / bounds / hazards は
 * 06-test-data.md 3章のとおり会場中心の緯度経度から向きと距離で生成する。
 */
import type { SeedCtx, CourseRef, HoleRef, PlayerRef, VenueRef } from './context'
import { bump } from './context'
import { colorFor, svgCard, svgMap, uploadSvg } from './media'
import { Rng, streamFor } from './rng'
import { circlePolygon, destPoint, rich, toMeters, type LatLng } from './util'

/* ------------------------------------------------------------------ *
 * 会場マスタ（架空・実在名は使わない）
 * ------------------------------------------------------------------ */

type VenueSeed = {
  slug: string
  name: string
  courseName: string
  address: string
  center: LatLng
  station: string
  ic: string
}

export const VENUE_SEEDS: VenueSeed[] = [
  {
    slug: 'kasumi-seaside',
    name: '霞ヶ浦シーサイドカントリークラブ',
    courseName: 'シーサイドコース',
    address: '茨城県架空市美浦台 1-1',
    center: { lat: 36.0231, lng: 140.3874 },
    station: '架空ヶ浦駅',
    ic: '美浦台 IC',
  },
  {
    slug: 'rokko-greenhills',
    name: '六甲グリーンヒルズゴルフ倶楽部',
    courseName: 'ヒルズコース',
    address: '兵庫県架空市緑が丘 2-3',
    center: { lat: 34.7612, lng: 135.2438 },
    station: '緑が丘駅',
    ic: '六甲北 IC',
  },
  {
    slug: 'shinshu-shirakaba',
    name: '信州白樺ハイランドカントリークラブ',
    courseName: 'ハイランドコース',
    address: '長野県架空郡白樺高原 3-12',
    center: { lat: 36.2104, lng: 138.2291 },
    station: '白樺高原駅',
    ic: '高原中央 IC',
  },
  {
    slug: 'boso-ocean-links',
    name: '房総オーシャンリンクス',
    courseName: 'オーシャンコース',
    address: '千葉県架空市海浜 5-8',
    center: { lat: 35.2456, lng: 140.2103 },
    station: '海浜公園駅',
    ic: '房総南 IC',
  },
  {
    slug: 'chikushino-royal',
    name: '筑紫野ロイヤルゴルフクラブ',
    courseName: 'ロイヤルコース',
    address: '福岡県架空市筑紫野 7-2',
    center: { lat: 33.4802, lng: 130.5311 },
    station: '筑紫野中央駅',
    ic: '筑紫野 IC',
  },
  {
    slug: 'hokusetsu-ayanomori',
    name: '北摂彩の森カントリークラブ',
    courseName: '彩の森コース',
    address: '大阪府架空市彩の森 4-4',
    center: { lat: 34.8571, lng: 135.4712 },
    station: '彩の森口駅',
    ic: '北摂 IC',
  },
]

/** 18 ホールのパー配分: Par3 × 4 / Par4 × 10 / Par5 × 4 = 合計 72 */
const PAR_LAYOUT = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5]

const yardsForPar = (par: number, i: number): number => {
  if (par === 3) return 152 + (i % 4) * 17
  if (par === 5) return 498 + (i % 4) * 22
  return 358 + (i % 6) * 21
}

/* ------------------------------------------------------------------ *
 * シーズン
 * ------------------------------------------------------------------ */

export const seedSeasons = async (ctx: SeedCtx): Promise<void> => {
  const currentYear = ctx.today.getUTCFullYear()
  for (const [offset, label] of [
    [-1, '終了'],
    [0, '現行'],
  ] as const) {
    const year = currentYear + offset
    const doc = await ctx.payload.create({
      collection: 'seasons',
      data: {
        year,
        name: `${year} JAPAN TOUR シーズン（${label}）`,
        startDate: `${year}-03-01T00:00:00.000Z`,
        endDate: `${year}-11-30T00:00:00.000Z`,
      },
      overrideAccess: true,
      depth: 0,
    })
    ctx.seasons.push({ id: doc.id as number, year })
    bump(ctx, 'seasons')
  }
}

/* ------------------------------------------------------------------ *
 * ホールのジオメトリ生成（06-test-data.md 3章）
 * ------------------------------------------------------------------ */

type Hazard = { type: 'bunker' | 'water' | 'ob' | 'tree'; polygon: [number, number][] }

type HoleGeometry = {
  tee: LatLng
  green: LatLng
  hazards: Hazard[]
  bunkers: [number, number][][]
  water: [number, number][][]
  bounds: { swLat: number; swLng: number; neLat: number; neLng: number }
}

const buildHoleGeometry = (
  center: LatLng,
  index: number,
  par: number,
  yards: number,
  rng: Rng,
): HoleGeometry => {
  // ホールを会場中心のまわりにリング状に配置し、ティー→グリーンは接線方向へ向ける
  const ringAngle = (360 / 18) * index + 8
  const ringRadius = 360 + (index % 3) * 110 + rng.float(-30, 30)
  const tee = destPoint(center, ringAngle, ringRadius)
  const holeBearing = (ringAngle + 96 + rng.float(-14, 14) + 360) % 360
  const lengthM = toMeters(yards)
  const green = destPoint(tee, holeBearing, lengthM)

  const hazards: Hazard[] = []
  const bunkers: [number, number][][] = []
  const water: [number, number][][] = []

  // グリーンサイドバンカー（全ホール）
  const greenSide = destPoint(
    destPoint(green, holeBearing, -22),
    (holeBearing + 90) % 360,
    rng.bool() ? 20 : -20,
  )
  const gsPoly = circlePolygon(greenSide, 13, 8, 0.7)
  bunkers.push(gsPoly)
  hazards.push({ type: 'bunker', polygon: gsPoly })

  // フェアウェイバンカー（Par4 / Par5）
  if (par >= 4) {
    const fw = destPoint(
      destPoint(tee, holeBearing, lengthM * 0.58),
      (holeBearing + 90) % 360,
      rng.bool() ? 24 : -24,
    )
    const fwPoly = circlePolygon(fw, 11, 8, 0.8)
    bunkers.push(fwPoly)
    hazards.push({ type: 'bunker', polygon: fwPoly })
  }

  // 池（4 ホールに 1 つ）
  if (index % 4 === 1) {
    const pond = destPoint(
      destPoint(tee, holeBearing, lengthM * 0.74),
      (holeBearing + 90) % 360,
      rng.bool() ? 34 : -34,
    )
    const poly = circlePolygon(pond, 26, 10, 0.75)
    water.push(poly)
    hazards.push({ type: 'water', polygon: poly })
  }

  // 樹木
  if (index % 3 === 0) {
    const grove = destPoint(
      destPoint(tee, holeBearing, lengthM * 0.35),
      (holeBearing + 90) % 360,
      rng.bool() ? 46 : -46,
    )
    hazards.push({ type: 'tree', polygon: circlePolygon(grove, 30, 8, 0.6) })
  }

  // OB（ホール片側の外側帯）
  const side = index % 2 === 0 ? 1 : -1
  const obPts = [
    destPoint(destPoint(tee, holeBearing, 20), (holeBearing + 90) % 360, side * 62),
    destPoint(destPoint(tee, holeBearing, lengthM), (holeBearing + 90) % 360, side * 62),
    destPoint(destPoint(tee, holeBearing, lengthM), (holeBearing + 90) % 360, side * 84),
    destPoint(destPoint(tee, holeBearing, 20), (holeBearing + 90) % 360, side * 84),
  ]
  hazards.push({ type: 'ob', polygon: obPts.map((p) => [p.lat, p.lng] as [number, number]) })

  // bounds: ホール内の全要素を含む矩形 + 余白 70m
  const pts: LatLng[] = [
    tee,
    green,
    ...hazards.flatMap((h) => h.polygon.map(([lat, lng]) => ({ lat, lng }))),
  ]
  const latPad = 70 / 111320
  const lngPad = 70 / (111320 * Math.cos((center.lat * Math.PI) / 180))
  const r7 = (n: number) => Math.round(n * 1e7) / 1e7
  const bounds = {
    swLat: r7(Math.min(...pts.map((p) => p.lat)) - latPad),
    swLng: r7(Math.min(...pts.map((p) => p.lng)) - lngPad),
    neLat: r7(Math.max(...pts.map((p) => p.lat)) + latPad),
    neLng: r7(Math.max(...pts.map((p) => p.lng)) + lngPad),
  }

  return { tee, green, hazards, bunkers, water, bounds }
}

/* ------------------------------------------------------------------ *
 * 会場 / コース / ホール
 * ------------------------------------------------------------------ */

export const seedVenues = async (ctx: SeedCtx, liveVenueSlug: string): Promise<void> => {
  const rng = streamFor('venues')

  for (const vs of VENUE_SEEDS) {
    const mapId = await uploadSvg({
      payload: ctx.payload,
      key: `venue-map-${vs.slug}`,
      filename: `venue-map-${vs.slug}.png`,
      svg: svgMap(1200, 900, vs.name, rng.child(`map-${vs.slug}`)),
      alt: `${vs.name} 会場マップ`,
      caption: '1-22 会場マップ',
    })

    const venueDoc = await ctx.payload.create({
      collection: 'venues',
      data: {
        name: vs.name,
        slug: vs.slug,
        address: vs.address,
        location: { lat: vs.center.lat, lng: vs.center.lng },
        accessTrain: rich(
          `最寄りは${vs.station}です。駅東口より大会シャトルバスで約 20 分。`,
          '大会期間中は 7:00〜9:00 に 10 分間隔で運行します。',
        ),
        accessCar: rich(
          `${vs.ic}より約 12km（約 20 分）。`,
          '会場周辺に一般車の駐車場はありません。指定駐車場をご利用ください。',
        ),
        shuttleTimetable: [
          { time: '07:00', from: vs.station, to: vs.name, note: '始発' },
          { time: '07:30', from: vs.station, to: vs.name },
          { time: '08:00', from: vs.station, to: vs.name, note: '混雑時増便あり' },
          { time: '16:30', from: vs.name, to: vs.station },
          { time: '17:30', from: vs.name, to: vs.station, note: '最終便' },
        ],
        venueMapImage: mapId,
        googleMapUrl: `https://maps.google.com/?q=${vs.center.lat},${vs.center.lng}`,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'venues')

    // ---- コース
    const isLive = vs.slug === liveVenueSlug
    const totalYards = PAR_LAYOUT.reduce((s, p, i) => s + yardsForPar(p, i), 0)
    const layoutId = await uploadSvg({
      payload: ctx.payload,
      key: `course-layout-${vs.slug}`,
      filename: `course-layout-${vs.slug}.png`,
      svg: svgMap(1200, 900, `${vs.courseName} レイアウト`, rng.child(`layout-${vs.slug}`)),
      alt: `${vs.courseName} コースレイアウト図`,
      caption: '1-20 コースレイアウト',
    })
    const courseDoc = await ctx.payload.create({
      collection: 'courses',
      data: {
        name: vs.courseName,
        venue: venueDoc.id as number,
        par: 72,
        totalYards,
        description: rich(
          `${vs.name}のチャンピオンコース。全長 ${totalYards} ヤード・パー 72。`,
          '距離のあるパー 4 が続く後半 9 ホールがスコアメイクの鍵になります。',
        ),
        layoutImage: layoutId,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'courses')

    // ---- ホール
    const holes: HoleRef[] = []
    const handicaps = rng
      .child(`hcp-${vs.slug}`)
      .shuffle(Array.from({ length: 18 }, (_, i) => i + 1))

    for (let i = 0; i < 18; i++) {
      const par = PAR_LAYOUT[i] as number
      const yards = yardsForPar(par, i)
      const geo = buildHoleGeometry(vs.center, i, par, yards, rng.child(`hole-${vs.slug}-${i}`))

      let photo: number | undefined
      let illustration: number | undefined
      if (isLive) {
        // 開催中大会の会場のみホール写真・イラストを生成（生成コスト抑制）
        photo = await uploadSvg({
          payload: ctx.payload,
          key: `hole-photo-${vs.slug}-${i + 1}`,
          filename: `hole-photo-${vs.slug}-${i + 1}.png`,
          svg: svgCard(
            1280,
            720,
            colorFor(`hole-${vs.slug}-${i}`, { s: 42, l: 34 }),
            [
              { text: `${i + 1}H`, size: 120 },
              { text: `PAR ${par} / ${yards}yd`, size: 44, weight: 500, opacity: 0.9 },
            ],
            { corner: vs.name },
          ),
          alt: `${vs.courseName} ${i + 1}番ホール 全景`,
        })
        illustration = await uploadSvg({
          payload: ctx.payload,
          key: `hole-illust-${vs.slug}-${i + 1}`,
          filename: `hole-illust-${vs.slug}-${i + 1}.png`,
          svg: svgMap(900, 1200, `${i + 1}H PAR${par}`, rng.child(`hi-${vs.slug}-${i}`), 3),
          alt: `${vs.courseName} ${i + 1}番ホール イラスト`,
        })
      }

      const holeDoc = await ctx.payload.create({
        collection: 'holes',
        data: {
          course: courseDoc.id as number,
          number: i + 1,
          par,
          yards,
          handicap: handicaps[i] as number,
          description: rich(
            par === 3
              ? `${yards}ヤードのショートホール。グリーン手前のバンカーを避けてセンターを狙いたい。`
              : par === 5
                ? `${yards}ヤードのロングホール。2 打目の刻みどころがスコアを分ける。`
                : `${yards}ヤードのミドルホール。ティーショットはフェアウェイ右サイドが理想。`,
          ),
          photo,
          illustration,
          teeLocation: { lat: geo.tee.lat, lng: geo.tee.lng },
          greenLocation: { lat: geo.green.lat, lng: geo.green.lng },
          bounds: geo.bounds,
          hazards: geo.hazards.map((h) => ({ type: h.type, polygon: h.polygon })),
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'holes')

      holes.push({
        id: holeDoc.id as number,
        number: i + 1,
        par,
        yards,
        tee: geo.tee,
        green: geo.green,
        bunkers: geo.bunkers,
        water: geo.water,
      })
    }

    const course: CourseRef = {
      id: courseDoc.id as number,
      venueId: venueDoc.id as number,
      name: vs.courseName,
      holes,
    }

    // 施設ピン用のバウンディングボックス（会場中心 ±700m）
    const latPad = 700 / 111320
    const lngPad = 700 / (111320 * Math.cos((vs.center.lat * Math.PI) / 180))
    ctx.venues.push({
      id: venueDoc.id as number,
      slug: vs.slug,
      name: vs.name,
      center: vs.center,
      bounds: {
        swLat: vs.center.lat - latPad,
        swLng: vs.center.lng - lngPad,
        neLat: vs.center.lat + latPad,
        neLng: vs.center.lng + lngPad,
      },
      course,
    } satisfies VenueRef)
  }
}

/* ------------------------------------------------------------------ *
 * スポンサー
 * ------------------------------------------------------------------ */

const SPONSOR_SEEDS = [
  { name: '架空ホールディングス', tier: 'platinum' as const },
  { name: 'ニホンリンクス保険', tier: 'platinum' as const },
  { name: 'サンライズ自動車', tier: 'gold' as const },
  { name: 'グリーンベイ銀行', tier: 'gold' as const },
  { name: 'ミライ電機', tier: 'silver' as const },
  { name: 'アオゾラ飲料', tier: 'silver' as const },
  { name: 'ツバサ航空', tier: 'bronze' as const },
  { name: 'カスミ製薬', tier: 'bronze' as const },
]

export const seedSponsors = async (ctx: SeedCtx): Promise<void> => {
  const year = ctx.today.getUTCFullYear()
  for (let i = 0; i < SPONSOR_SEEDS.length; i++) {
    const s = SPONSOR_SEEDS[i] as (typeof SPONSOR_SEEDS)[number]
    const logo = await uploadSvg({
      payload: ctx.payload,
      key: `sponsor-logo-${i}`,
      filename: `sponsor-${i + 1}.png`,
      svg: svgCard(600, 600, colorFor(`sponsor-${s.name}`, { s: 62, l: 38 }), [
        { text: s.name, size: 40 },
        { text: s.tier.toUpperCase(), size: 26, weight: 500, opacity: 0.8 },
      ]),
      alt: `${s.name} ロゴ`,
    })
    const doc = await ctx.payload.create({
      collection: 'sponsors',
      data: {
        name: s.name,
        logo,
        tier: s.tier,
        contractFrom: `${year - 1}-01-01T00:00:00.000Z`,
        contractTo: `${year + 1}-12-31T00:00:00.000Z`,
        landingUrl: `https://example.com/sponsors/s${i + 1}`,
      },
      overrideAccess: true,
      depth: 0,
    })
    ctx.sponsors.push({ id: doc.id as number, name: s.name })
    bump(ctx, 'sponsors')
  }
}

/* ------------------------------------------------------------------ *
 * 選手（80 名。うち 20 名はスター選手）
 * ------------------------------------------------------------------ */

const SURNAMES: [string, string][] = [
  ['佐々木', 'Sasaki'],
  ['久保田', 'Kubota'],
  ['一ノ瀬', 'Ichinose'],
  ['神谷', 'Kamiya'],
  ['芦原', 'Ashihara'],
  ['後藤', 'Goto'],
  ['白鳥', 'Shiratori'],
  ['桐生', 'Kiryu'],
  ['天野', 'Amano'],
  ['鷹取', 'Takatori'],
  ['三上', 'Mikami'],
  ['葉山', 'Hayama'],
  ['柚木', 'Yuki'],
  ['南雲', 'Nagumo'],
  ['朝比奈', 'Asahina'],
  ['稲垣', 'Inagaki'],
  ['月島', 'Tsukishima'],
  ['羽根田', 'Haneda'],
  ['滝沢', 'Takizawa'],
  ['小川', 'Ogawa'],
]

const GIVENS: [string, string][] = [
  ['蒼真', 'Soma'],
  ['颯太', 'Sota'],
  ['琉生', 'Ryusei'],
  ['悠仁', 'Yujin'],
  ['陽向', 'Hinata'],
  ['伊織', 'Iori'],
  ['奏汰', 'Kanata'],
  ['湊斗', 'Minato'],
  ['律希', 'Ritsuki'],
  ['大和', 'Yamato'],
  ['遥斗', 'Haruto'],
  ['慶次', 'Keiji'],
  ['真人', 'Masato'],
  ['蓮司', 'Renji'],
  ['理央', 'Rio'],
  ['駿介', 'Shunsuke'],
  ['和馬', 'Kazuma'],
  ['壮太', 'Sota'],
  ['右京', 'Ukyo'],
  ['圭吾', 'Keigo'],
]

const BIRTH_PLACES = [
  '北海道',
  '青森県',
  '宮城県',
  '茨城県',
  '千葉県',
  '東京都',
  '神奈川県',
  '静岡県',
  '愛知県',
  '京都府',
  '大阪府',
  '兵庫県',
  '広島県',
  '福岡県',
  '熊本県',
  '沖縄県',
]

const GEAR_BRANDS = ['TOURMAX', 'GREENSPEC', 'AXIS GOLF', 'RYOKA', 'NANBU', 'SEIRYU']

export const seedPlayers = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('players')
  const year = ctx.today.getUTCFullYear()

  for (let i = 0; i < 80; i++) {
    const s = SURNAMES[i % 20] as [string, string]
    const g = GIVENS[(i * 7 + Math.floor(i / 20)) % 20] as [string, string]
    const name = `${s[0]}${g[0]}`
    const nameEn = `${g[1]} ${s[1]}`
    const slug = `${s[1]}-${g[1]}-${String(i + 1).padStart(3, '0')}`.toLowerCase()
    const isStar = i < 20
    const prng = rng.child(`player-${i}`)
    const initials = `${g[1][0]}${s[1][0]}`

    let photoId: number | undefined
    if (isStar) {
      // 8-14 / 補-8-14-1: 正方形 1:1・800×800
      photoId = await uploadSvg({
        payload: ctx.payload,
        key: `player-photo-${slug}`,
        filename: `player-${slug}.png`,
        svg: svgCard(800, 800, colorFor(`player-${slug}`, { s: 55, l: 40 }), [
          { text: initials, size: 260 },
          { text: name, size: 56, weight: 500, opacity: 0.92 },
        ]),
        alt: `${name} 選手 顔写真`,
      })
    }

    const turnedPro = year - prng.int(3, 16)
    const doc = await ctx.payload.create({
      collection: 'players',
      data: {
        name,
        nameEn,
        slug,
        photo: photoId,
        birthDate: `${year - prng.int(21, 40)}-${String(prng.int(1, 12)).padStart(2, '0')}-${String(
          prng.int(1, 28),
        ).padStart(2, '0')}T00:00:00.000Z`,
        height: prng.int(165, 188),
        weight: prng.int(62, 88),
        birthPlace: prng.pick(BIRTH_PLACES),
        turnedProYear: turnedPro,
        bio: isStar
          ? rich(
              `${name}（${nameEn}）は${turnedPro}年にプロ転向。正確なアイアンショットとショートゲームを武器にツアーの上位を争う。`,
              'パーオン率とサンドセーブ率でツアー上位につけており、終盤の勝負強さにも定評がある。',
            )
          : rich(`${name}（${nameEn}）は${turnedPro}年にプロ転向。ツアー出場を重ねている。`),
        careerHighlights: isStar
          ? [
              { year: turnedPro, title: 'プロ転向' },
              { year: turnedPro + 2, title: 'ツアー初優勝' },
              { year: year - 1, title: `${year - 1}年 賞金ランキング ${prng.int(1, 12)}位` },
              { year, title: `${year}年 ツアー${prng.int(1, 3)}勝` },
            ]
          : [{ year: turnedPro, title: 'プロ転向' }],
        equipment: isStar
          ? [
              {
                category: 'driver' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `TX-${prng.int(100, 999)}`,
              },
              {
                category: 'iron' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `CB-${prng.int(100, 999)}`,
              },
              {
                category: 'wedge' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `SW-${prng.int(50, 62)}`,
              },
              {
                category: 'putter' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `PT-${prng.int(1, 12)}`,
              },
              {
                category: 'ball' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `PRO-V${prng.int(1, 5)}`,
              },
            ]
          : [
              {
                category: 'driver' as const,
                brand: prng.pick(GEAR_BRANDS),
                model: `TX-${prng.int(100, 999)}`,
              },
            ],
        sponsors: isStar
          ? prng.sample(ctx.sponsors, prng.int(1, 3)).map((sp) => sp.id)
          : prng.bool(0.25)
            ? [prng.pick(ctx.sponsors).id]
            : [],
        isActive: i < 76, // 4 名は引退扱い（一覧フィルタの確認用）
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'players')

    ctx.players.push({
      id: doc.id as number,
      index: i,
      name,
      nameEn,
      slug,
      isStar,
      // skill が小さいほど強い
      skill: isStar ? -2.6 + i * 0.09 : -0.4 + (i - 20) * 0.045,
      photoId,
    } satisfies PlayerRef)
  }
}
