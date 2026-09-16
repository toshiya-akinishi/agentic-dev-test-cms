import type { CollectionConfig } from 'payload'

import { anyone, operatorOnly } from '../access'

/**
 * 組み合わせ・スタート時刻（要求 1-8 / 補-1-8-2, 補-1-8-3）
 * 各組に 組番号・スタート時刻・スタートホール（1 or 10）・選手 2〜3 名を持つ。
 */
export const Pairings: CollectionConfig = {
  slug: 'pairings',
  labels: { singular: '組み合わせ', plural: '組み合わせ' },
  admin: {
    group: 'ツアー・大会',
    useAsTitle: 'groupNo',
    defaultColumns: ['round', 'groupNo', 'startTime', 'startHole', 'players'],
  },
  // docs/02-data-model.md ロール別アクセス制御: 組み合わせは operator（admin/operator）の CRUD 対象（補-8-9-1）
  access: {
    read: anyone,
    create: operatorOnly,
    update: operatorOnly,
    delete: operatorOnly,
  },
  fields: [
    {
      name: 'round',
      type: 'relationship',
      relationTo: 'rounds',
      label: 'ラウンド',
      required: true,
      index: true,
      admin: { description: '補-1-8-2。組み合わせはラウンド別に管理します' },
    },
    {
      name: 'groupNo',
      type: 'number',
      label: '組番号',
      required: true,
      min: 1,
      admin: { description: '補-1-8-2' },
    },
    {
      name: 'startTime',
      type: 'date',
      label: 'スタート時刻',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '補-1-8-2',
      },
    },
    {
      name: 'startHole',
      type: 'number',
      label: 'スタートホール',
      required: true,
      defaultValue: 1,
      validate: (value: unknown) =>
        value === 1 || value === 10 ? true : 'スタートホールは 1 または 10 のみ指定できます',
      admin: { description: '補-1-8-2。1（アウト）または 10（イン）のみ' },
    },
    {
      name: 'players',
      type: 'relationship',
      relationTo: 'players',
      hasMany: true,
      label: '選手',
      admin: {
        description: '補-1-8-2。1 組 2〜3 名。補-1-8-3 のお気に入りフィルタ対象',
      },
    },
  ],
}

export default Pairings
