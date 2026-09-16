import type { CollectionConfig } from 'payload'
import { anyone, staffOnly } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'メディア', plural: 'メディア' },
  admin: {
    group: '共通',
    useAsTitle: 'alt',
    defaultColumns: ['filename', 'alt', 'caption', 'credit', 'filesize'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'video/*', 'application/pdf'],
    imageSizes: [
      { name: 'thumb', width: 320, height: undefined, position: 'centre' },
      { name: 'card', width: 720, height: undefined, position: 'centre' },
      { name: 'hero', width: 1440, height: undefined, position: 'centre' },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', required: true, label: '代替テキスト' },
    { name: 'caption', type: 'text', label: 'キャプション' },
    { name: 'credit', type: 'text', label: 'クレジット' },
  ],
}

export default Media
