/**
 * コンテンツ系（ニュース / 観戦ガイド / 用語集 / FAQ / オンボーディング / 選手ストーリー /
 * ハイライト編成 / プレイリスト）
 */
import type { SeedCtx } from './context'
import { bump } from './context'
import { colorFor, svgCard, uploadSvg } from './media'
import { streamFor } from './rng'
import type { VideoSeedResult } from './videos'
import { addDays, addHours, iso, rich } from './util'

/* ------------------------------------------------------------------ *
 * ニュース（40件: 大会関連25 / 選手10 / お知らせ5）
 * ------------------------------------------------------------------ */

export const seedNews = async (ctx: SeedCtx): Promise<void> => {
  const finishedOrLive = ctx.tournaments.filter((t) => t.kind !== 'cancelled' && t.kind !== 'scheduled')

  const heroFor = async (key: string, title: string) =>
    uploadSvg({
      payload: ctx.payload,
      key: `news-hero-${key}`,
      filename: `news-${key}.png`,
      svg: svgCard(1280, 720, colorFor(`news-${key}`, { s: 50, l: 34 }), [{ text: title, size: 40 }]),
      alt: `${title} ニュース画像`,
    })

  // 大会関連 25件
  for (let i = 0; i < 25; i++) {
    const t = finishedOrLive[i % finishedOrLive.length]!
    const templates = [
      `${t.name} 開幕直前情報`,
      `${t.name} 初日ハイライト`,
      `${t.name} 2日目 予選通過ライン速報`,
      `${t.name} 最終日 優勝争いプレビュー`,
      `${t.name} 大会結果まとめ`,
    ]
    const title = `${templates[i % templates.length]}（${i + 1}）`
    const slug = `news-tournament-${t.code.toLowerCase()}-${i}`
    const hero = await heroFor(slug, t.name)
    await ctx.payload.create({
      collection: 'news',
      data: {
        title,
        slug,
        body: rich(`${t.name}に関する最新情報をお届けします。`, `会場: ${t.venue.name}`),
        heroImage: hero,
        tournament: t.id,
        category: 'tournament',
        publishedAt: iso(addHours(t.startDate, -24 + i)),
        isPinned: i === 0,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'news')
  }

  // 選手関連 10件
  const stars = ctx.players.filter((p) => p.isStar)
  for (let i = 0; i < 10; i++) {
    const p = stars[i % stars.length]!
    const slug = `news-player-${p.slug}-${i}`
    const hero = await heroFor(slug, p.name)
    await ctx.payload.create({
      collection: 'news',
      data: {
        title: `${p.name} 選手 今シーズンの調子は？`,
        slug,
        body: rich(`${p.name}選手の最近のプレー内容を振り返ります。`),
        heroImage: hero,
        players: [p.id],
        category: 'player',
        publishedAt: iso(addDays(ctx.today, -i * 3)),
        isPinned: false,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'news')
  }

  // お知らせ 5件
  const announcements = [
    'アプリメンテナンスのお知らせ',
    '新機能「ショットビュー」提供開始',
    '会員登録キャンペーンのお知らせ',
    'お問い合わせ窓口の混雑について',
    '利用規約改定のお知らせ',
  ]
  for (let i = 0; i < 5; i++) {
    const slug = `news-announce-${i}`
    const hero = await heroFor(slug, announcements[i]!)
    await ctx.payload.create({
      collection: 'news',
      data: {
        title: announcements[i]!,
        slug,
        body: rich(`${announcements[i]}についてご案内します。`),
        heroImage: hero,
        category: 'announcement',
        publishedAt: iso(addDays(ctx.today, -i)),
        isPinned: false,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'news')
  }
}

/* ------------------------------------------------------------------ *
 * 観戦ガイド（12件: マナー5 / ルール5 / はじめて2）
 * ------------------------------------------------------------------ */

export const seedGuideArticles = async (ctx: SeedCtx): Promise<void> => {
  const plan: { category: 'manner' | 'rule' | 'beginner'; titles: string[] }[] = [
    {
      category: 'manner',
      titles: [
        'ギャラリーの服装マナー',
        '撮影・録画に関するマナー',
        'ショット中の静粛について',
        '応援の仕方とタイミング',
        'ゴミの持ち帰りとマナー',
      ],
    },
    {
      category: 'rule',
      titles: [
        'ストロークプレーの基本ルール',
        'ペナルティエリアの扱い',
        'カット（予選通過）の仕組み',
        'プレーオフの方式',
        'ドロップの基本ルール',
      ],
    },
    { category: 'beginner', titles: ['はじめての観戦ガイド', 'コースの回り方・見どころ'] },
  ]
  let order = 0
  for (const group of plan) {
    for (const title of group.titles) {
      const slug = `guide-${group.category}-${order}`
      const images = [
        await uploadSvg({
          payload: ctx.payload,
          key: `guide-img-${slug}`,
          filename: `${slug}.png`,
          svg: svgCard(1000, 700, colorFor(`guide-${slug}`, { s: 46, l: 40 }), [{ text: title, size: 40 }]),
          alt: title,
        }),
      ]
      await ctx.payload.create({
        collection: 'guide-articles',
        data: {
          title,
          slug,
          category: group.category,
          body: rich(`${title}について解説します。`, '観戦を楽しむための基本情報です。'),
          images,
          order,
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'guide-articles')
      order++
    }
  }
}

/* ------------------------------------------------------------------ *
 * 用語集（60件）
 * ------------------------------------------------------------------ */

const GLOSSARY_TERMS: { term: string; reading: string; aliases?: string[]; category: string; desc: string }[] = [
  { term: 'バーディ', reading: 'ばーでぃ', aliases: ['birdie'], category: 'score', desc: 'パーより 1 打少ないスコア。' },
  { term: 'ボギー', reading: 'ぼぎー', aliases: ['bogey'], category: 'score', desc: 'パーより 1 打多いスコア。' },
  { term: 'イーグル', reading: 'いーぐる', aliases: ['eagle'], category: 'score', desc: 'パーより 2 打少ないスコア。' },
  { term: 'ダブルボギー', reading: 'だぶるぼぎー', aliases: ['double bogey'], category: 'score', desc: 'パーより 2 打多いスコア。' },
  { term: 'パー', reading: 'ぱー', aliases: ['par'], category: 'score', desc: 'そのホールの基準打数。' },
  { term: 'ホールインワン', reading: 'ほーるいんわん', aliases: ['hole in one', 'ace'], category: 'score', desc: '1 打でカップイン。' },
  { term: 'アルバトロス', reading: 'あるばとろす', aliases: ['albatross'], category: 'score', desc: 'パーより 3 打少ないスコア。' },
  { term: 'トリプルボギー', reading: 'とりぷるぼぎー', category: 'score', desc: 'パーより 3 打多いスコア。' },
  { term: 'カット', reading: 'かっと', aliases: ['cut'], category: 'tournament', desc: '規定順位までの選手のみが決勝ラウンドへ進出する制度。' },
  { term: 'プレーオフ', reading: 'ぷれーおふ', aliases: ['playoff'], category: 'tournament', desc: '同スコアの場合に行う決着戦。' },
  { term: 'ドローボール', reading: 'どろーぼーる', aliases: ['draw'], category: 'shot', desc: '右から左に曲がる球筋（右打ち）。' },
  { term: 'フェードボール', reading: 'ふぇーどぼーる', aliases: ['fade'], category: 'shot', desc: '左から右に曲がる球筋（右打ち）。' },
  { term: 'スライス', reading: 'すらいす', category: 'shot', desc: '大きく右に曲がる球筋（右打ち）。' },
  { term: 'フック', reading: 'ふっく', category: 'shot', desc: '大きく左に曲がる球筋（右打ち）。' },
  { term: 'アプローチ', reading: 'あぷろーち', category: 'shot', desc: 'グリーン周りから寄せるショット。' },
  { term: 'パット', reading: 'ぱっと', category: 'shot', desc: 'グリーン上で転がすショット。' },
  { term: 'バンカーショット', reading: 'ばんかーしょっと', category: 'shot', desc: 'バンカーから打つショット。' },
  { term: 'リカバリーショット', reading: 'りかばりーしょっと', category: 'shot', desc: '苦しい状況から立て直すショット。' },
  { term: 'フェアウェイ', reading: 'ふぇあうぇい', category: 'course', desc: 'ティーとグリーンの間の整備された区域。' },
  { term: 'ラフ', reading: 'らふ', category: 'course', desc: 'フェアウェイの外側の芝が長い区域。' },
  { term: 'グリーン', reading: 'ぐりーん', category: 'course', desc: 'カップが切られた区域。' },
  { term: 'ハザード', reading: 'はざーど', category: 'course', desc: '池やバンカーなどの障害区域。' },
  { term: 'OB', reading: 'おーびー', aliases: ['out of bounds'], category: 'course', desc: 'プレー禁止区域。' },
  { term: 'ドッグレッグ', reading: 'どっぐれっぐ', category: 'course', desc: 'フェアウェイが左右に曲がるホール形状。' },
  { term: 'ドライバー', reading: 'どらいばー', category: 'equipment', desc: '最も飛距離の出るクラブ。' },
  { term: 'アイアン', reading: 'あいあん', category: 'equipment', desc: '番手ごとに距離を打ち分けるクラブ。' },
  { term: 'ウェッジ', reading: 'うぇっじ', category: 'equipment', desc: '短い距離を打つためのクラブ。' },
  { term: 'パター', reading: 'ぱたー', category: 'equipment', desc: 'グリーン上で使うクラブ。' },
  { term: 'キャディ', reading: 'きゃでぃ', category: 'other', desc: '選手をサポートする専門スタッフ。' },
  { term: 'ギャラリー', reading: 'ぎゃらりー', category: 'other', desc: '観戦者のこと。' },
]

export const seedGlossaryTerms = async (ctx: SeedCtx): Promise<void> => {
  const base = GLOSSARY_TERMS
  for (let i = 0; i < 60; i++) {
    const g = base[i % base.length]!
    const suffix = i >= base.length ? ` (${Math.floor(i / base.length) + 1})` : ''
    await ctx.payload.create({
      collection: 'glossary-terms',
      data: {
        term: `${g.term}${suffix}`,
        reading: g.reading,
        aliases: (g.aliases ?? []).map((v) => ({ value: v })),
        description: rich(g.desc),
        category: g.category as never,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'glossary-terms')
  }
}

/* ------------------------------------------------------------------ *
 * FAQ（20件・6カテゴリ）
 * ------------------------------------------------------------------ */

const FAQ_SEEDS: { category: string; q: string; a: string }[] = [
  { category: 'account', q: 'パスワードを忘れました', a: 'ログイン画面の「パスワードをお忘れですか」からリセットできます。' },
  { category: 'account', q: '退会したい', a: 'マイページの「アカウント設定」から退会手続きができます。' },
  { category: 'account', q: '2段階認証の設定方法は？', a: '認証アプリでQRコードを読み取り設定します。' },
  { category: 'ticket', q: 'チケットのキャンセルはできますか？', a: '購入後のキャンセルは大会規定に準じます。' },
  { category: 'ticket', q: '電子チケットの使い方は？', a: 'マイページのQRコードを入場ゲートで提示してください。' },
  { category: 'ticket', q: '駐車券は別売りですか？', a: 'はい、駐車券は別途ご購入いただけます。' },
  { category: 'video', q: '動画がダウンロードできません', a: '著作権保護のためダウンロードには対応していません。' },
  { category: 'video', q: '動画を共有したい', a: '動画詳細の共有ボタんからURLを共有できます。' },
  { category: 'video', q: 'ハイライトはいつ配信されますか？', a: '大会終了後、順次配信します。' },
  { category: 'notification', q: '通知が届きません', a: '端末の通知設定とアプリ内の通知設定をご確認ください。' },
  { category: 'notification', q: '緊急通知は止められますか？', a: '安全に関わるため緊急通知は停止できません。' },
  { category: 'notification', q: 'お気に入り選手の通知設定は？', a: '選手詳細画面から通知項目を選択できます。' },
  { category: 'onsite', q: '会場の駐車場はありますか？', a: '会場周辺に指定駐車場をご用意しています。' },
  { category: 'onsite', q: '会場内での飲食は可能ですか？', a: 'フードコートをご利用いただけます。' },
  { category: 'onsite', q: '雨天時は中止になりますか？', a: '荒天時は中止・順延の可能性があります。通知をご確認ください。' },
  { category: 'other', q: 'アプリの動作環境を教えてください', a: '最新版のiOS/Androidに対応しています。' },
  { category: 'other', q: 'お問い合わせ方法は？', a: 'マイページの「お問い合わせ」フォームからご連絡ください。' },
  { category: 'other', q: '広告を非表示にできますか？', a: '現在、広告非表示オプションはご用意しておりません。' },
  { category: 'account', q: 'メールアドレスを変更したい', a: 'マイページのプロフィール編集から変更できます。' },
  { category: 'video', q: '縦型動画とは何ですか？', a: 'スマートフォンでの視聴に最適化されたショート動画です。' },
]

export const seedFaqs = async (ctx: SeedCtx): Promise<void> => {
  for (let i = 0; i < FAQ_SEEDS.length; i++) {
    const f = FAQ_SEEDS[i]!
    await ctx.payload.create({
      collection: 'faqs',
      data: { question: f.q, answer: rich(f.a), category: f.category as never, order: i },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'faqs')
  }
}

/* ------------------------------------------------------------------ *
 * オンボーディングスライド（4件）
 * ------------------------------------------------------------------ */

export const seedOnboardingSlides = async (ctx: SeedCtx): Promise<void> => {
  const slides = [
    { title: 'J-Tour Fan Appへようこそ', body: '国内男子ツアーを、もっと身近に。' },
    { title: 'リーダーボードをリアルタイムで', body: '大会の速報をいち早くチェック。' },
    { title: 'ショット動画で選手のプレーを体感', body: 'ショットビューでコースを再現。' },
    { title: 'お気に入り選手を登録しよう', body: '最大10名まで登録できます。' },
  ]
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]!
    const image = await uploadSvg({
      payload: ctx.payload,
      key: `onboarding-${i}`,
      filename: `onboarding-${i}.png`,
      svg: svgCard(1080, 1920, colorFor(`onboarding-${i}`, { s: 55, l: 32 }), [
        { text: s.title, size: 56 },
        { text: s.body, size: 30, weight: 400, opacity: 0.85 },
      ]),
      alt: s.title,
    })
    await ctx.payload.create({
      collection: 'onboarding-slides',
      data: { title: s.title, body: s.body, image, order: i + 1 },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'onboarding-slides')
  }
}

/* ------------------------------------------------------------------ *
 * 選手ストーリー（記事。動画は player_story 動画と紐づけ）
 * ------------------------------------------------------------------ */

export const seedPlayerStories = async (ctx: SeedCtx, videoResult: VideoSeedResult): Promise<void> => {
  const stars = ctx.players.filter((p) => p.isStar).slice(0, 10)
  for (let i = 0; i < stars.length; i++) {
    const p = stars[i]!
    await ctx.payload.create({
      collection: 'player-stories',
      data: {
        player: p.id,
        title: `${p.name} その強さの理由`,
        body: rich(`${p.name}選手のプレースタイルと歩みを紹介します。`),
        video: videoResult.playerStoryVideoIds[i],
        publishedAt: iso(addDays(ctx.today, -i * 5)),
        order: i,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'player-stories')
  }
}

/* ------------------------------------------------------------------ *
 * ハイライト編成（ADR-008: home_carousel / tournament_daily / auto_playlist）
 * ------------------------------------------------------------------ */

export const seedHighlightReels = async (ctx: SeedCtx, videoResult: VideoSeedResult): Promise<void> => {
  const rng = streamFor('highlight-reels')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!

  // 2-14 ホームカルーセル（全ユーザー共通・最大8件）
  await ctx.payload.create({
    collection: 'highlight-reels',
    data: {
      title: '今週の注目プレー',
      type: 'home_carousel',
      items: rng.sample(videoResult.highlightVideoIds, 8),
      isAutoGenerated: false,
      publishedAt: iso(ctx.today),
      order: 0,
    },
    overrideAccess: true,
    depth: 0,
  })
  bump(ctx, 'highlight-reels')

  // 2-13 大会デイリーハイライト（大会×ラウンドごと）
  let order = 0
  for (const t of ctx.tournaments.filter((tt) => tt.kind === 'finished' || tt.kind === 'live')) {
    for (const round of t.rounds.slice(0, 2)) {
      await ctx.payload.create({
        collection: 'highlight-reels',
        data: {
          title: `${t.name} ${round.number}日目ハイライト`,
          type: 'tournament_daily',
          tournament: t.id,
          round: round.id,
          items: rng.sample(videoResult.shotVideoIds, Math.min(5, videoResult.shotVideoIds.length)),
          isAutoGenerated: false,
          publishedAt: iso(round.date),
          order,
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'highlight-reels')
      order++
    }
  }

  // 2-15 自動プレイリスト（ラウンド×選手）
  for (const p of ctx.players.filter((pp) => pp.isStar).slice(0, 4)) {
    await ctx.payload.create({
      collection: 'highlight-reels',
      data: {
        title: `${p.name} プレー集（${live.name}）`,
        type: 'auto_playlist',
        tournament: live.id,
        player: p.id,
        items: rng.sample(videoResult.shotVideoIds, Math.min(3, videoResult.shotVideoIds.length)),
        isAutoGenerated: true,
        publishedAt: iso(ctx.today),
        order: 0,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'highlight-reels')
  }
}

/* ------------------------------------------------------------------ *
 * プレイリスト（ユーザー作成の再生リスト。fan1 に紐づけ）
 * ------------------------------------------------------------------ */

export const seedPlaylists = async (
  ctx: SeedCtx,
  videoResult: VideoSeedResult,
  fanUserId: number,
): Promise<void> => {
  const rng = streamFor('playlists')
  await ctx.payload.create({
    collection: 'playlists',
    data: {
      name: 'マイベストショット',
      owner: fanUserId,
      items: rng.sample(videoResult.shotVideoIds, Math.min(10, videoResult.shotVideoIds.length)),
      isPublic: true,
      shareToken: 'pl-fan1-best',
    },
    overrideAccess: true,
    depth: 0,
  })
  bump(ctx, 'playlists')

  await ctx.payload.create({
    collection: 'playlists',
    data: {
      name: 'ゲスト端末のお気に入り動画',
      deviceId: 'seed-guest-device-0001',
      items: rng.sample(videoResult.highlightVideoIds, Math.min(5, videoResult.highlightVideoIds.length)),
      isPublic: false,
    },
    overrideAccess: true,
    depth: 0,
  })
  bump(ctx, 'playlists')
}
