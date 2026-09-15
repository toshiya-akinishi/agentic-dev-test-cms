import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * シーズン（年間ツアー）
 * 大会・ランキングの親となる単位（1-3 のシーズン切替セレクタ / 補-1-3-3）
 */
export const Seasons: CollectionConfig = {
  slug: 'seasons',
  labels: { singular: 'シーズン', plural: 'シーズン' },
  admin: {
    group: 'ツアー・大会',
    useAsTitle: 'name',
    defaultColumns: ['name', 'year', 'startDate', 'endDate'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'year',
      type: 'number',
      label: '年',
      required: true,
      unique: true,
      index: true,
      min: 1900,
      max: 2100,
      admin: { description: '補-1-3-3。シーズン切替セレクタの既定は現行シーズン' },
    },
    { name: 'name', type: 'text', label: 'シーズン名', required: true },
    { name: 'startDate', type: 'date', label: '開始日', required: true },
    { name: 'endDate', type: 'date', label: '終了日', required: true },
  ],
}

export default Seasons
