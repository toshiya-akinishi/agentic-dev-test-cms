import type { CollectionConfig } from 'payload'

import { anyone, editorOnly } from '../access'

/**
 * FAQ（要求 6-13 / 補-6-13-1）
 * カテゴリ別アコーディオン + キーワード検索で表示する。
 */
export const Faqs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: 'FAQ', plural: 'FAQ' },
  admin: {
    group: 'ヘルプ',
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'order', 'updatedAt'],
    description: '6-13。よくある質問。補-6-13-1 のカテゴリ別アコーディオンで表示する',
  },
  access: {
    read: anyone,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  defaultSort: 'order',
  fields: [
    {
      name: 'question',
      type: 'text',
      label: '質問',
      required: true,
      admin: { description: '6-13' },
    },
    {
      name: 'answer',
      type: 'richText',
      label: '回答',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      label: 'カテゴリ',
      options: [
        { label: 'アカウント', value: 'account' },
        { label: 'チケット', value: 'ticket' },
        { label: '動画', value: 'video' },
        { label: '通知', value: 'notification' },
        { label: '現地観戦', value: 'onsite' },
        { label: 'その他', value: 'other' },
      ],
      admin: { position: 'sidebar', description: '補-6-13-1' },
    },
    {
      name: 'order',
      type: 'number',
      label: '表示順',
      defaultValue: 0,
      admin: { position: 'sidebar', description: '昇順で表示。同一カテゴリ内の並び順' },
    },
  ],
}

export default Faqs
