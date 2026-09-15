import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * 券種（要求 5-1 / 補-5-1-3）
 * 1日券 / 通し券 / 駐車券 などを大会ごとに定義する。
 * 販売期間（salesStart〜salesEnd）外、または stock=0 の券種は購入不可として表示する（補-5-1-3）。
 */
export const TicketTypes: CollectionConfig = {
  slug: 'ticket-types',
  labels: { singular: '券種', plural: '券種' },
  admin: {
    group: 'チケット',
    useAsTitle: 'name',
    defaultColumns: ['name', 'tournament', 'price', 'validDate', 'stock', 'salesEnd'],
    description:
      '5-1。補-5-1-3 により、販売期間外・在庫 0 の券種はアプリ側で購入不可として表示されます',
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
      admin: { description: '5-1。補-5-1-1 により大会詳細の「チケット」ブロックから導線を出す' },
    },
    {
      name: 'name',
      type: 'text',
      label: '券種名',
      required: true,
      admin: { description: '補-5-1-3。例: 1日券 / 通し券 / 駐車券' },
    },
    {
      name: 'price',
      type: 'number',
      label: '価格（円）',
      required: true,
      min: 0,
      admin: { description: '5-1。税込価格' },
    },
    {
      name: 'validDate',
      type: 'date',
      label: '有効日',
      admin: {
        description:
          '5-3。補-5-3-1 により、status=paid かつ有効日が当日以降のチケットを「有効」として表示する',
      },
    },
    {
      name: 'stock',
      type: 'number',
      label: '在庫数',
      min: 0,
      admin: { description: '補-5-1-3。0 の場合は購入不可' },
    },
    {
      name: 'salesStart',
      type: 'date',
      label: '販売開始日時',
      admin: { description: '補-5-1-3' },
    },
    {
      name: 'salesEnd',
      type: 'date',
      label: '販売終了日時',
      admin: { description: '補-5-1-3' },
    },
  ],
}

export default TicketTypes
