import type { CollectionConfig } from 'payload'

import { adminOnly, anyone } from '../access'

/**
 * スポンサー（要求 8-3, 8-5）
 * `ad-creatives` の出稿主体。`users.sponsor` から参照され、
 * sponsor ロールのユーザーは自社に紐づくクリエイティブのみ閲覧できる（補-8-9-2）。
 */
export const Sponsors: CollectionConfig = {
  slug: 'sponsors',
  labels: { singular: 'スポンサー', plural: 'スポンサー' },
  admin: {
    group: 'スポンサー・広告',
    useAsTitle: 'name',
    defaultColumns: ['name', 'tier', 'contractFrom', 'contractTo'],
    description: '8-3 / 8-5。補-8-9-2 により sponsor ロールのユーザーは自社データのみ参照できる',
  },
  access: {
    // アプリにロゴ等を出すため参照は公開（8-5）。編集は admin のみ（8-9）
    read: anyone,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'スポンサー名',
      required: true,
      index: true,
      admin: { description: '8-3' },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: 'ロゴ',
      admin: { description: '8-4。表示回数レポートの対象となるスポンサーロゴ' },
    },
    {
      name: 'tier',
      type: 'select',
      label: '契約ティア',
      options: [
        { label: 'プラチナ', value: 'platinum' },
        { label: 'ゴールド', value: 'gold' },
        { label: 'シルバー', value: 'silver' },
        { label: 'ブロンズ', value: 'bronze' },
      ],
      admin: {
        position: 'sidebar',
        description: '8-3。スポンサー価値に応じた区分（元表に値の定義がないため 4 段階で仮置き）',
      },
    },
    {
      name: 'contractFrom',
      type: 'date',
      label: '契約開始日',
      admin: { description: '8-3' },
    },
    {
      name: 'contractTo',
      type: 'date',
      label: '契約終了日',
      admin: { description: '8-3' },
    },
    {
      name: 'landingUrl',
      type: 'text',
      label: 'ランディングURL',
      admin: { description: '8-5。ロゴ・バナータップ時の遷移先（クリエイティブ側の linkUrl が優先）' },
    },
  ],
}

export default Sponsors
