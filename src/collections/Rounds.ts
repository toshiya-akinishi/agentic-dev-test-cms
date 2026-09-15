import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * ラウンド（大会の各日）
 * スコア（3-1）・組み合わせ（1-8）の親となる単位。
 */
export const Rounds: CollectionConfig = {
  slug: 'rounds',
  labels: { singular: 'ラウンド', plural: 'ラウンド' },
  admin: {
    group: 'ツアー・大会',
    useAsTitle: 'number',
    defaultColumns: ['tournament', 'number', 'date', 'status'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      required: true,
      index: true,
    },
    {
      name: 'number',
      type: 'number',
      label: 'ラウンド番号',
      required: true,
      min: 1,
      max: 4,
      admin: { description: '1〜4（1R〜最終日）' },
    },
    { name: 'date', type: 'date', label: '開催日', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      label: 'ステータス',
      required: true,
      defaultValue: 'scheduled',
      options: [
        { label: '予定', value: 'scheduled' },
        { label: '進行中', value: 'live' },
        { label: '終了', value: 'finished' },
        { label: '中断', value: 'suspended' },
      ],
      admin: {
        position: 'sidebar',
        description: '補-1-23-1。中断（suspended）は緊急通知の種別と連動します',
      },
    },
  ],
}

export default Rounds
