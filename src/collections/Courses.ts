import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * コース（要求 1-19, 1-20）
 */
export const Courses: CollectionConfig = {
  slug: 'courses',
  labels: { singular: 'コース', plural: 'コース' },
  admin: {
    group: '会場・コース',
    useAsTitle: 'name',
    defaultColumns: ['name', 'venue', 'par', 'totalYards'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    { name: 'name', type: 'text', label: 'コース名', required: true },
    {
      name: 'venue',
      type: 'relationship',
      relationTo: 'venues',
      label: '会場',
      required: true,
      index: true,
    },
    {
      name: 'par',
      type: 'number',
      label: 'パー（合計）',
      required: true,
      min: 1,
      admin: { description: '補-1-19-1。18 ホール合計のパー' },
    },
    { name: 'totalYards', type: 'number', label: '全長（ヤード）', min: 0 },
    {
      name: 'description',
      type: 'richText',
      label: 'コース説明',
      admin: { description: '1-19' },
    },
    {
      name: 'layoutImage',
      type: 'upload',
      relationTo: 'media',
      label: 'コースレイアウト図',
      admin: { description: '1-20' },
    },
  ],
}

export default Courses
