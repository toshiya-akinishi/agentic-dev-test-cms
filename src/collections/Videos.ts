import type { Access, CollectionConfig } from 'payload'

import { editorOnly, isStaff } from '../access'
import { locationField } from '../fields/location'

/**
 * 公開済みのみ read（補-8-8-3）。
 * drafts 有効コレクションでは、下書き（`_status = draft`）を公開 API に出さない。
 * スタッフ（admin / editor / operator）は下書きも参照できる。
 */
const readPublished: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true
  return {
    or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }],
  }
}

/** 動画タグ（補-2-10-1 の 8 種） */
export const VIDEO_TAG_OPTIONS = [
  { label: 'イーグル', value: 'eagle' },
  { label: 'バーディー', value: 'birdie' },
  { label: 'ホールインワン', value: 'hole_in_one' },
  { label: 'ロングパット', value: 'long_putt' },
  { label: 'ナイスショット', value: 'nice_shot' },
  { label: 'アプローチ', value: 'approach' },
  { label: 'バンカーセーブ', value: 'bunker_save' },
  { label: 'ドライブ', value: 'drive' },
]

/**
 * 動画（要求 2-8〜2-15, 2-21, 2-22）
 * ショット動画・ハイライト・縦型ストーリー・選手ストーリー・ライブアーカイブを 1 コレクションで保持する。
 */
export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: { singular: '動画', plural: '動画' },
  admin: {
    group: '動画',
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'tournament', 'player', 'publishedAt', '_status'],
    description: 'ショット動画・ハイライト・縦型ストーリーを管理します（2-8〜2-15）',
  },
  // 補-8-8-3: 下書き / 公開のバージョニング
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  access: {
    read: readPublished,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  fields: [
    { name: 'title', type: 'text', label: 'タイトル', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'スラッグ',
      required: true,
      unique: true,
      index: true,
      admin: { description: '共有 URL `/watch/<slug>` に使用します（補-2-21-2）' },
    },
    {
      name: 'kind',
      type: 'select',
      label: '種別',
      required: true,
      index: true,
      defaultValue: 'shot',
      options: [
        { label: 'ショット動画', value: 'shot' },
        { label: 'ハイライト', value: 'highlight' },
        { label: '縦型ストーリー', value: 'story_vertical' },
        { label: '選手ストーリー', value: 'player_story' },
        { label: 'ライブアーカイブ', value: 'live_archive' },
      ],
      admin: {
        description:
          'shot=2-8 全ショット動画 / highlight=2-13, 2-14 ハイライト / story_vertical=2-12 縦型ショート / player_story=4-1 選手ストーリー / live_archive=補-2-1-2 配信アーカイブ',
      },
    },

    // --- 再生ソース ---
    {
      type: 'collapsible',
      label: '再生ソース',
      fields: [
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          label: '動画ファイル',
          admin: { description: 'ローカル再生用（MOCK）。HLS 配信時は hlsUrl を使用します' },
        },
        {
          name: 'hlsUrl',
          type: 'text',
          label: 'HLS URL',
          admin: { description: '実配信基盤に接続する際はこの値のみ差し替えます（補-2-2-3）' },
        },
        {
          name: 'thumbnail',
          type: 'upload',
          relationTo: 'media',
          label: 'サムネイル',
          required: true,
          admin: { description: 'OGP 画像未設定時のフォールバックにも使用します（補-2-22-1）' },
        },
        {
          name: 'durationSec',
          type: 'number',
          label: '再生時間（秒）',
          min: 0,
          admin: { description: '縦型ストーリーは 15〜60 秒を想定（補-2-12-2）' },
        },
        {
          name: 'orientation',
          type: 'select',
          label: '動画の向き',
          defaultValue: 'landscape',
          options: [
            { label: '横型', value: 'landscape' },
            { label: '縦型', value: 'portrait' },
          ],
          admin: { description: '2-12 縦型ストーリーは portrait を指定します' },
        },
      ],
    },

    // --- 2-9 メタデータ群 ---
    {
      type: 'collapsible',
      label: 'メタデータ（2-9）',
      admin: {
        description:
          '要求 2-9 / 補-2-9-1。大会・ラウンド・選手・ホール・ショット番号・ショット時刻・ショット種別・打点位置・停止位置',
      },
      fields: [
        {
          name: 'tournament',
          type: 'relationship',
          relationTo: 'tournaments',
          label: '大会',
          index: true,
          admin: { description: '2-8 検索フィルタ軸（補-2-8-1）' },
        },
        {
          name: 'round',
          type: 'relationship',
          relationTo: 'rounds',
          label: 'ラウンド',
          index: true,
          admin: { description: '2-8 検索フィルタ軸（補-2-8-1）' },
        },
        {
          name: 'player',
          type: 'relationship',
          relationTo: 'players',
          label: '選手',
          index: true,
          admin: { description: '2-8 検索フィルタ軸（補-2-8-1）' },
        },
        {
          name: 'hole',
          type: 'number',
          label: 'ホール番号',
          min: 1,
          max: 18,
          index: true,
          admin: { description: '2-9 / 補-2-15-1 の並べ替えキー（hole 昇順）' },
        },
        {
          name: 'shotNo',
          type: 'number',
          label: 'ショット番号',
          min: 1,
          admin: { description: '2-9 / 補-2-15-1 の並べ替えキー（shotNo 昇順）' },
        },
        { name: 'shotTime', type: 'date', label: 'ショット時刻', admin: { description: '2-9' } },
        {
          name: 'shotType',
          type: 'select',
          label: 'ショット種別',
          index: true,
          options: [
            { label: 'ティーショット', value: 'tee' },
            { label: 'アプローチ', value: 'approach' },
            { label: 'バンカー', value: 'bunker' },
            { label: 'リカバリー', value: 'recovery' },
            { label: 'パット', value: 'putt' },
            { label: 'ペナルティ', value: 'penalty' },
          ],
          admin: { description: '2-9 / 2-8 検索フィルタ軸（補-2-8-1）。shots.shotType と同一の選択肢' },
        },
        locationField('startLocation', '打点位置（緯度経度）', {
          description: '2-9。ミニマップ上で打点→停止点の線として表示します（補-2-9-2）',
        }),
        locationField('endLocation', '停止位置（緯度経度）', {
          description: '2-9。ミニマップ上で打点→停止点の線として表示します（補-2-9-2）',
        }),
      ],
    },

    // --- タグ（2-10） ---
    {
      name: 'tags',
      type: 'select',
      label: 'タグ',
      hasMany: true,
      index: true,
      options: VIDEO_TAG_OPTIONS,
      admin: {
        description:
          '補-2-10-1 の 8 種。2-8 検索フィルタ軸（補-2-8-1）。自動付与ロジックは src/lib/autoTag.ts（補-2-10-2）',
      },
    },
    {
      name: 'autoTagged',
      type: 'checkbox',
      label: '自動タグ付与済み',
      defaultValue: false,
      admin: {
        description:
          '補-2-10-3。自動付与されたタグであることを示します。人手修正後は自動再付与しません（チェックを外して保存）',
      },
    },

    // --- 公開・シェア ---
    {
      name: 'publishedAt',
      type: 'date',
      label: '公開日時',
      required: true,
      index: true,
      admin: { position: 'sidebar', description: '一覧は publishedAt 降順（補-2-8-2 新着順）' },
    },
    {
      type: 'collapsible',
      label: 'シェア / OGP（2-21, 2-22）',
      fields: [
        {
          name: 'ogTitle',
          type: 'text',
          label: 'OGP タイトル',
          admin: {
            description:
              '2-22。未設定時の既定フォーマット: `{選手名} {大会名} {ラウンド}R {ホール}H - {タグ}`（補-2-22-2）',
          },
        },
        {
          name: 'ogImage',
          type: 'upload',
          relationTo: 'media',
          label: 'OGP 画像',
          admin: { description: '2-22。未設定時は thumbnail を使用（補-2-22-1）' },
        },
        {
          name: 'shareUrl',
          type: 'text',
          label: '共有 URL',
          admin: {
            description:
              '2-21。既定は `https://<cms>/watch/<slug>`（補-2-21-2）。動画ファイルの DL は提供しません（ADR-009）',
          },
        },
      ],
    },

    // --- 集計値 ---
    {
      name: 'viewCount',
      type: 'number',
      label: '再生数',
      defaultValue: 0,
      min: 0,
      admin: { position: 'sidebar', description: '8-4 の視聴集計から更新' },
    },
    {
      name: 'likeCount',
      type: 'number',
      label: 'いいね数',
      defaultValue: 0,
      min: 0,
      index: true,
      admin: { position: 'sidebar', description: '2-11。補-2-8-2 の「人気順」ソートに使用' },
    },
  ],
}

export default Videos
