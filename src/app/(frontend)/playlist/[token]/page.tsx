import type { Metadata } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import type { Media, Playlist, Video } from '../../../../payload-types'

/**
 * プレイリスト共有ページ（要求 2-23 / 補-2-23-2）
 *
 * アプリ側（agentic-dev-test-app）は `${API_URL}/playlist/<shareToken>` という共有 URL を
 * 組み立てて OS 標準シェアシートに渡す（`src/lib/share.ts` の `buildPlaylistShareUrl`）が、
 * cms 側にこの URL 用のページが無く 404 していた（今回埋めるギャップ。T-12-9 実装時点の
 * コメントに「cms 側の専用トークン閲覧エンドポイントは cms 側スコープ外・要確認のギャップ」と
 * 明記されていた）。
 *
 * `watch/[slug]/page.tsx`（T-12-11 の OGP ページ）と同じ規約に倣う: OGP メタタグを出し、
 * シンプルな一覧を SSR する。プレイリストの編集は提供しない（閲覧専用。編集は所有者のみ、
 * アプリ側の「自分のプレイリスト一覧からしか開けない」導線で担保する方針は変えない）。
 *
 * アクセス制御: `Playlists.ts` の `access.read`（ownerOrDevice）は共有 URL の匿名閲覧者には
 * 通らないため、ここでは `overrideAccess: true` で取得したうえで
 * `isPublic === true && shareToken === token` をこのページ自身で確認する
 * （＝非公開プレイリストや不正な token は 404）。
 *
 * Playlists コレクションに `description` フィールドは存在しない（要求文には「説明」と
 * あるが、02-data-model.md / Playlists.ts のスキーマにその欄は無い）ため、
 * OGP description と本文の補足テキストは動画本数から組み立てる。
 */

// 収録動画は追加・削除・並べ替えされ得るため、常に最新の内容を参照する
export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ token: string }>
}

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')

const absoluteUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  if (/^https?:\/\//.test(url)) return url
  return `${SERVER_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

const asMedia = (value: unknown): Media | undefined =>
  value && typeof value === 'object' ? (value as Media) : undefined

const asVideo = (value: number | Video): Video | undefined => (typeof value === 'object' ? value : undefined)

/**
 * 公開されている（isPublic かつ shareToken 一致）プレイリストのみ返す。
 * それ以外（非公開・token 不一致・存在しない）は undefined = 呼び出し側で 404。
 */
const getPublicPlaylistByToken = async (token: string): Promise<Playlist | undefined> => {
  if (!token) return undefined
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'playlists',
    where: { shareToken: { equals: token }, isPublic: { equals: true } },
    limit: 1,
    depth: 2, // playlist -> items(video) -> thumbnail(media)
    overrideAccess: true,
  })
  const doc = result.docs[0]
  // 二重チェック（shareToken 発行後に isPublic が false に戻された場合の取りこぼし防止）
  if (!doc || !doc.isPublic || doc.shareToken !== token) return undefined
  return doc
}

const videosOf = (playlist: Playlist): Video[] =>
  (playlist.items ?? []).map((it) => asVideo(it)).filter((v): v is Video => Boolean(v))

const subtitleOf = (videoCount: number): string =>
  videoCount > 0 ? `${videoCount}本の動画` : 'まだ動画が登録されていません'

export const generateMetadata = async ({ params }: Args): Promise<Metadata> => {
  const { token } = await params
  const playlist = await getPublicPlaylistByToken(token)
  if (!playlist) return { title: 'プレイリストが見つかりません - J-Tour CMS' }

  const videos = videosOf(playlist)
  const description = `${subtitleOf(videos.length)} - J-Tour Fan App のプレイリスト`
  const firstThumbnail = asMedia(videos[0]?.thumbnail)
  const image = absoluteUrl(firstThumbnail?.url)
  const pageUrl = `${SERVER_URL}/playlist/${token}`

  return {
    title: `${playlist.name} - J-Tour Fan App`,
    description,
    openGraph: {
      type: 'website',
      title: playlist.name,
      description,
      url: pageUrl,
      siteName: 'J-Tour Fan App',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: playlist.name,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function PlaylistSharePage({ params }: Args) {
  const { token } = await params
  const playlist = await getPublicPlaylistByToken(token)
  if (!playlist) notFound()

  const videos = videosOf(playlist)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{playlist.name}</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>{subtitleOf(videos.length)}</p>

      {videos.length === 0 ? (
        <p>このプレイリストにはまだ動画がありません。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {videos.map((video) => {
            const thumbnail = asMedia(video.thumbnail)
            const thumbUrl = absoluteUrl(thumbnail?.sizes?.card?.url ?? thumbnail?.url)
            return (
              <li key={video.id}>
                <Link
                  href={`/watch/${video.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #eee',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={video.title}
                      width={128}
                      height={72}
                      style={{ width: 128, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 128, height: 72, background: '#eee', borderRadius: 4, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 14 }}>{video.title}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p style={{ marginTop: 32, fontSize: 12, color: '#999' }}>
        このプレイリストは共有リンクから閲覧しています。編集はプレイリストの所有者のみ行えます。
      </p>
    </main>
  )
}
