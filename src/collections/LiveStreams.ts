import type { CollectionConfig } from 'payload'

import { anyone, editorOnly } from '../access'

/**
 * ライブ配信（要求 2-1, 2-2）
 * 実配信基盤には接続せず、サンプル HLS / ローカル動画で再生する（MOCK / 補-2-2-3）。
 */
export const LiveStreams: CollectionConfig = {
  slug: 'live-streams',
  labels: { singular: 'ライブ配信', plural: 'ライブ配信' },
  admin: {
    group: '動画',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tournament', 'kind', 'status', 'startedAt'],
    description: '練習場配信（2-2）・インスタライブ（2-1）の配信枠を管理します',
  },
  access: {
    read: anyone,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  fields: [
    { name: 'title', type: 'text', label: 'タイトル', required: true },
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      required: true,
      index: true,
    },
    {
      name: 'kind',
      type: 'select',
      label: '配信種別',
      required: true,
      defaultValue: 'practice_range',
      options: [
        { label: '練習場カメラ', value: 'practice_range' },
        { label: 'インスタライブ', value: 'instagram_live' },
        { label: '注目組帯同', value: 'featured_group' },
      ],
      admin: {
        description:
          'practice_range=2-2（固定カメラ 1 系統。UI に選手名を出さない／補-2-2-1）/ instagram_live=2-1 / featured_group=2-1',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'ステータス',
      required: true,
      defaultValue: 'scheduled',
      index: true,
      options: [
        { label: '配信予定', value: 'scheduled' },
        { label: '配信中', value: 'live' },
        { label: '配信終了', value: 'ended' },
      ],
      admin: { description: '補-2-1-2。ended になったら archiveVideo へ自動的に切り替えます' },
    },
    {
      name: 'streamUrl',
      type: 'text',
      label: '配信 URL',
      admin: {
        description:
          '補-2-2-3。サンプル HLS / ローカル動画を指定します。実配信移行時はこの値のみ差し替えます（MOCK）',
      },
    },
    {
      name: 'archiveVideo',
      type: 'relationship',
      relationTo: 'videos',
      label: 'アーカイブ動画',
      admin: { description: '補-2-1-2。配信終了後に再生する videos（kind=live_archive）' },
    },
    { name: 'startedAt', type: 'date', label: '配信開始日時' },
    { name: 'endedAt', type: 'date', label: '配信終了日時' },
    {
      name: 'delaySec',
      type: 'number',
      label: '遅延秒数',
      min: 0,
      defaultValue: 0,
      admin: {
        description:
          '2-1 / 補-2-1-1。数分〜2 時間（7200 秒）の遅延を許容。UI に「追っかけ再生」ラベルと遅延時間を表示します',
      },
    },
  ],
}

export default LiveStreams
