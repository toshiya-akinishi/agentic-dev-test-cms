import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * 大会（要求 1-3, 1-4, 1-8, 1-13, 1-26）
 */
export const Tournaments: CollectionConfig = {
  slug: 'tournaments',
  labels: { singular: '大会', plural: '大会' },
  admin: {
    group: 'ツアー・大会',
    useAsTitle: 'name',
    defaultColumns: ['name', 'season', 'venue', 'startDate', 'endDate', 'status'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    { name: 'name', type: 'text', label: '大会名', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'スラッグ',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL 用の一意な識別子' },
    },
    {
      name: 'season',
      type: 'relationship',
      relationTo: 'seasons',
      label: 'シーズン',
      required: true,
      index: true,
      admin: { description: '補-1-3-3。シーズン切替セレクタで絞り込みます' },
    },
    {
      name: 'venue',
      type: 'relationship',
      relationTo: 'venues',
      label: '会場',
      required: true,
      index: true,
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      label: 'コース',
      required: true,
      index: true,
    },
    { name: 'startDate', type: 'date', label: '開幕日', required: true, index: true },
    { name: 'endDate', type: 'date', label: '最終日', required: true },
    {
      name: 'prizeMoneyTotal',
      type: 'number',
      label: '賞金総額（円）',
      required: true,
      min: 0,
      admin: { description: '補-1-3-2。大会一覧の行に表示します' },
    },
    {
      name: 'status',
      type: 'select',
      label: 'ステータス',
      required: true,
      index: true,
      defaultValue: 'scheduled',
      options: [
        { label: '予定', value: 'scheduled' },
        { label: '開催中', value: 'live' },
        { label: '終了', value: 'finished' },
        { label: '中止', value: 'cancelled' },
        { label: '順延', value: 'postponed' },
      ],
      admin: {
        position: 'sidebar',
        description:
          '補-1-3-2 のステータスバッジ。補-1-23-4 により cancelled / postponed の間はアプリ上部に赤バナーを表示します',
      },
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      label: 'ヒーロー画像',
      admin: { description: '補-1-8-1 の大会詳細ヘッダー' },
    },
    { name: 'description', type: 'richText', label: '大会概要' },
    {
      name: 'pamphletPdf',
      type: 'upload',
      relationTo: 'media',
      label: 'パンフレット PDF',
      admin: { description: '1-13 / 補-1-13-1。PDF と Web URL の両方がある場合は PDF を優先' },
    },
    {
      name: 'pamphletWebUrl',
      type: 'text',
      label: 'パンフレット Web URL',
      admin: { description: '1-13 / 補-1-13-1' },
    },
    {
      name: 'officialStoreUrl',
      type: 'text',
      label: '公式ストア URL',
      admin: { description: '1-26 / 補-1-26-1。購入は外部 EC へ遷移します' },
    },
    {
      name: 'ticketUrl',
      type: 'text',
      label: 'チケット購入 URL',
      admin: { description: '5-1' },
    },
    {
      name: 'cutLineAfterRound',
      type: 'number',
      label: '予選カットのラウンド',
      defaultValue: 2,
      min: 1,
      max: 4,
      admin: { description: '1-8。何ラウンド終了時点で予選カットを行うか（既定 2）' },
    },
    { name: 'cutRule', type: 'text', label: '予選通過条件', admin: { description: '1-8' } },
  ],
}

export default Tournaments
