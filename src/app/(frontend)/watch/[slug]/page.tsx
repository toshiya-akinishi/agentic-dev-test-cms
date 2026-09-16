import type { Metadata } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { VIDEO_TAG_OPTIONS } from '../../../../collections/Videos'
import type { Media, Player, Round, Tournament, Video } from '../../../../payload-types'

/**
 * Web 視聴ページ（要求 2-21, 2-22 / 補-2-21-2 / 補-2-22-1, 2 / T-12-11）
 * `GET /watch/:slug` — シェア URL の遷移先。OGP（og:title / og:image / og:description /
 * og:video）+ Twitter Card（summary_large_image）を出力し、シンプルな <video> プレイヤーで
 * 再生する。動画のダウンロード/書き出しは提供しない（ADR-009。共有はリンクのみ）。
 *
 * アクセス制御: Videos.ts の `readPublished`（補-8-8-3）をそのまま適用する
 * （`overrideAccess: false` で匿名リクエストとして評価）。下書き動画は匿名の訪問者には
 * 見つからず 404 になる。
 */

// 動画は編集され得るため、常に最新のレコードを参照する
export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ slug: string }>
}

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')

const absoluteUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  if (/^https?:\/\//.test(url)) return url
  return `${SERVER_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

const asMedia = (value: unknown): Media | undefined =>
  value && typeof value === 'object' ? (value as Media) : undefined
const asTournament = (value: unknown): Tournament | undefined =>
  value && typeof value === 'object' ? (value as Tournament) : undefined
const asRound = (value: unknown): Round | undefined =>
  value && typeof value === 'object' ? (value as Round) : undefined
const asPlayer = (value: unknown): Player | undefined =>
  value && typeof value === 'object' ? (value as Player) : undefined

const tagLabel = (tag: string): string => VIDEO_TAG_OPTIONS.find((o) => o.value === tag)?.label ?? tag

/**
 * 下書きは匿名には見せない。Videos コレクションの `readPublished` アクセス制御を
 * そのまま適用するため `overrideAccess: false` を明示する（`payload.find` の既定値は
 * `true` = アクセス制御無視のため注意）。
 */
const getVideoBySlug = async (slug: string): Promise<Video | undefined> => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'videos',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: false,
  })
  return result.docs[0]
}

/** OGP タイトルの既定フォーマット: `{選手名} {大会名} {ラウンド}R {ホール}H - {タグ}`（補-2-22-2） */
const buildTitle = (video: Video): string => {
  if (video.ogTitle) return video.ogTitle

  const player = asPlayer(video.player)
  const tournament = asTournament(video.tournament)
  const round = asRound(video.round)

  const parts = [
    player?.name,
    tournament?.name,
    round ? `${round.number}R` : undefined,
    video.hole ? `${video.hole}H` : undefined,
  ].filter((p): p is string => Boolean(p))

  let title = parts.join(' ')
  const primaryTag = video.tags?.[0]
  if (primaryTag) title = title ? `${title} - ${tagLabel(primaryTag)}` : tagLabel(primaryTag)

  return title || video.title
}

const buildDescription = (video: Video): string => {
  const tournament = asTournament(video.tournament)
  const round = asRound(video.round)

  const bits = [
    tournament?.name,
    round ? `${round.number}R` : undefined,
    video.hole ? `${video.hole}番ホール` : undefined,
    video.tags?.length ? video.tags.map(tagLabel).join(' / ') : undefined,
  ].filter((b): b is string => Boolean(b))

  return bits.length > 0 ? `${bits.join(' ・ ')} - J-Tour Fan App` : 'J-Tour Fan App の動画です'
}

export const generateMetadata = async ({ params }: Args): Promise<Metadata> => {
  const { slug } = await params
  const video = await getVideoBySlug(slug)
  if (!video) return { title: '動画が見つかりません - J-Tour CMS' }

  const title = buildTitle(video)
  const description = buildDescription(video)
  // ogImage 未設定時は thumbnail をフォールバックに使用（補-2-22-1）
  const image = absoluteUrl(asMedia(video.ogImage)?.url ?? asMedia(video.thumbnail)?.url)
  const pageUrl = `${SERVER_URL}/watch/${video.slug}`
  const videoUrl = absoluteUrl(asMedia(video.file)?.url) ?? video.hlsUrl ?? undefined

  return {
    title: `${title} - J-Tour Fan App`,
    description,
    openGraph: {
      type: 'video.other',
      title,
      description,
      url: pageUrl,
      siteName: 'J-Tour Fan App',
      images: image ? [{ url: image }] : undefined,
      videos: videoUrl ? [{ url: videoUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function WatchPage({ params }: Args) {
  const { slug } = await params
  const video = await getVideoBySlug(slug)
  if (!video) notFound()

  const player = asPlayer(video.player)
  const tournament = asTournament(video.tournament)
  const round = asRound(video.round)
  const thumbnail = asMedia(video.thumbnail)
  const ogImage = asMedia(video.ogImage)
  const fileMedia = asMedia(video.file)
  const posterUrl = absoluteUrl(ogImage?.url ?? thumbnail?.url)
  // 補-8-8-2: file（アップロード）優先、無ければ hlsUrl を再生ソースにする
  const playbackUrl = absoluteUrl(fileMedia?.url) ?? video.hlsUrl ?? undefined

  const metaRows: Array<[string, string]> = []
  if (player?.name) metaRows.push(['選手', player.name])
  if (tournament?.name) metaRows.push(['大会', tournament.name])
  if (round?.number) metaRows.push(['ラウンド', `${round.number}R`])
  if (video.hole) metaRows.push(['ホール', `${video.hole}番`])
  if (video.shotNo) metaRows.push(['ショット番号', String(video.shotNo)])
  if (video.shotType) metaRows.push(['ショット種別', video.shotType])
  if (video.tags?.length) metaRows.push(['タグ', video.tags.map(tagLabel).join(' / ')])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{buildTitle(video)}</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 16 }}>
        {[tournament?.name, round ? `${round.number}R` : null, video.hole ? `${video.hole}番ホール` : null]
          .filter(Boolean)
          .join(' / ')}
      </p>

      {playbackUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          controls
          playsInline
          poster={posterUrl}
          style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 8 }}
          src={playbackUrl}
        >
          お使いのブラウザは動画再生に対応していません。
        </video>
      ) : (
        <p>再生ソースが設定されていません。</p>
      )}

      {metaRows.length > 0 && (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            rowGap: 8,
            columnGap: 12,
            marginTop: 24,
            fontSize: 14,
          }}
        >
          {metaRows.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt style={{ color: '#888' }}>{label}</dt>
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p style={{ marginTop: 32, fontSize: 12, color: '#999' }}>
        共有はリンク共有のみです。動画ファイルのダウンロード・書き出しは提供していません（ADR-009）。
      </p>
    </main>
  )
}
