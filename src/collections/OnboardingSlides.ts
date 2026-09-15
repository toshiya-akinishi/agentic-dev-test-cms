import type { CollectionConfig } from 'payload'

import { anyone, editorOnly } from '../access'

/**
 * オンボーディングスライド（要求 6-12 / 補-6-12-1, 補-6-12-2）
 * 初回起動時のチュートリアル。マイページ →「使い方ガイド」から再表示できる。
 */
export const OnboardingSlides: CollectionConfig = {
  slug: 'onboarding-slides',
  labels: { singular: 'オンボーディングスライド', plural: 'オンボーディングスライド' },
  admin: {
    group: 'ヘルプ',
    useAsTitle: 'title',
    defaultColumns: ['order', 'title', 'image', 'updatedAt'],
    description: '6-12。補-6-12-1 の 4 スライド（アプリでできること / リーダーボード / 動画 / お気に入り）',
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
      name: 'title',
      type: 'text',
      label: 'タイトル',
      required: true,
      admin: { description: '6-12' },
    },
    {
      name: 'body',
      type: 'textarea',
      label: '本文',
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: '画像',
    },
    {
      name: 'order',
      type: 'number',
      label: '表示順',
      required: true,
      defaultValue: 1,
      admin: {
        position: 'sidebar',
        description: '補-6-12-1。昇順で表示。最終スライドに「お気に入り選手を選ぶ」「あとで」を置く',
      },
    },
  ],
}

export default OnboardingSlides
