import type { CollectionConfig } from 'payload'

import { anyone, editorOnly } from '../access'

/**
 * ゴルフ用語集（要求 1-2）
 * かな（`reading`）と英字・別名（`aliases`）でもインクリメンタルサーチできるようにする（補-1-2-1）。
 */
export const GlossaryTerms: CollectionConfig = {
  slug: 'glossary-terms',
  labels: { singular: '用語', plural: '用語集' },
  admin: {
    group: 'コンテンツ',
    useAsTitle: 'term',
    defaultColumns: ['term', 'reading', 'category', 'updatedAt'],
    description: '1-2。バーディ／ボギー／プレーオフ等のゴルフ用語解説',
  },
  access: {
    read: anyone,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  fields: [
    { name: 'term', type: 'text', label: '用語', required: true, index: true },
    {
      name: 'reading',
      type: 'text',
      label: '読み（かな）',
      required: true,
      index: true,
      admin: {
        description: '補-1-2-1。かな検索用。ひらがなで入力します（入力 1 文字からの前方一致検索に使用）',
      },
    },
    {
      name: 'aliases',
      type: 'array',
      label: '別名・英字表記',
      admin: {
        description: '補-1-2-1。英字表記や略称も検索対象にします（例: birdie / バーディー）',
      },
      fields: [{ name: 'value', type: 'text', label: '別名', required: true }],
    },
    {
      name: 'description',
      type: 'richText',
      label: '解説',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      label: 'カテゴリ',
      index: true,
      defaultValue: 'score',
      options: [
        { label: 'スコア', value: 'score' },
        { label: 'ルール', value: 'rule' },
        { label: 'ショット', value: 'shot' },
        { label: 'コース', value: 'course' },
        { label: 'クラブ・道具', value: 'equipment' },
        { label: '大会・競技', value: 'tournament' },
        { label: 'その他', value: 'other' },
      ],
      admin: { description: '1-2。用語集一覧の絞り込みに使用します' },
    },
    {
      name: 'relatedTerms',
      type: 'relationship',
      relationTo: 'glossary-terms',
      hasMany: true,
      label: '関連用語',
      admin: { description: '補-1-2-2。用語詳細に最大 5 件表示します' },
    },
  ],
}

export default GlossaryTerms
