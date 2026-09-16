import type { CollectionConfig } from 'payload'

import { anyone, operatorOnly } from '../access'
import { locationField } from '../fields'

/**
 * 会場内施設（要求 1-22, 1-25 / 補-1-22-1, 補-1-22-2, 補-1-25-1）
 */
export const VenueFacilities: CollectionConfig = {
  slug: 'venue-facilities',
  labels: { singular: '会場内施設', plural: '会場内施設' },
  admin: {
    group: '現地情報',
    useAsTitle: 'name',
    defaultColumns: ['name', 'venue', 'type', 'tournament', 'openHours'],
  },
  // docs/02-data-model.md ロール別アクセス制御: 会場内施設は operator（admin/operator）の CRUD 対象（補-8-9-1）
  access: {
    read: anyone,
    create: operatorOnly,
    update: operatorOnly,
    delete: operatorOnly,
  },
  fields: [
    {
      name: 'venue',
      type: 'relationship',
      relationTo: 'venues',
      label: '会場',
      required: true,
      index: true,
    },
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      index: true,
      admin: { description: '任意。大会開催期間のみ設置される施設に指定します' },
    },
    {
      name: 'type',
      type: 'select',
      label: '施設種別',
      required: true,
      index: true,
      options: [
        { label: 'トイレ', value: 'toilet' },
        { label: '飲食', value: 'food' },
        { label: 'グッズ', value: 'goods' },
        { label: '救護所', value: 'firstaid' },
        { label: '入場ゲート', value: 'entrance' },
        { label: '案内所', value: 'info' },
        { label: '喫煙所', value: 'smoking' },
        { label: 'ATM', value: 'atm' },
      ],
      admin: {
        description:
          '補-1-22-1。会場マップのピン種別は トイレ / 飲食 / グッズ / 救護所 / 入場ゲート / 案内所 / 喫煙所 / ATM の 8 種',
      },
    },
    { name: 'name', type: 'text', label: '施設名', required: true },
    locationField('location', '位置（緯度経度）', {
      required: true,
      description: '補-1-22-1。実地図上に重畳する施設ピンの座標',
    }),
    {
      name: 'description',
      type: 'textarea',
      label: '説明',
      admin: { description: '補-1-22-2。ピンタップ時のボトムシートに表示します' },
    },
    { name: 'photo', type: 'upload', relationTo: 'media', label: '写真' },
    {
      name: 'menuItems',
      type: 'array',
      label: 'メニュー・商品',
      admin: {
        description:
          '補-1-25-1。グルメ・お土産は type=food / goods のメニュー配列で表現します（写真・価格・場所を表示）',
      },
      fields: [
        { name: 'name', type: 'text', label: '商品名', required: true },
        { name: 'price', type: 'number', label: '価格（円）', min: 0 },
        { name: 'photo', type: 'upload', relationTo: 'media', label: '写真' },
      ],
    },
    {
      name: 'openHours',
      type: 'text',
      label: '営業時間',
      admin: { description: '補-1-22-2' },
    },
  ],
}

export default VenueFacilities
