import type { CollectionConfig } from 'payload'

import { anyone, operatorOnly } from '../access'
import { locationField } from '../fields'

/**
 * 選手位置情報（要求 1-31 / 02-data-model.md E章）
 *
 * 選手・大会ごとに「最新 1 件のみ」を参照する運用（補-1-31-1、更新間隔 30 秒）。
 * 履歴は残すため、参照時は recordedAt の降順で 1 件取得する。
 */
export const PlayerPositions: CollectionConfig = {
  slug: 'player-positions',
  labels: { singular: '選手位置情報', plural: '選手位置情報' },
  admin: {
    group: '選手・スコア',
    useAsTitle: 'player',
    defaultColumns: ['player', 'tournament', 'hole', 'recordedAt'],
    description:
      '1-31。補-1-31-1 のとおり更新間隔は 30 秒で、参照は選手ごとの最新 1 件のみ（recordedAt 降順）',
  },
  access: {
    read: anyone,
    create: operatorOnly,
    update: operatorOnly,
    delete: operatorOnly,
  },
  defaultSort: '-recordedAt',
  fields: [
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      required: true,
      index: true,
    },
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '選手',
      required: true,
      index: true,
    },
    // point 型は SQLite 非対応のため lat/lng の group で表現する
    locationField('location', '位置', {
      required: true,
      description: '1-31。選手の現在地（緯度・経度）',
    }),
    {
      name: 'hole',
      type: 'number',
      label: 'ホール番号',
      min: 1,
      max: 18,
      admin: { description: '1-31。プレー中のホール' },
    },
    {
      name: 'recordedAt',
      type: 'date',
      label: '記録日時',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '補-1-31-1。30 秒間隔で記録。最新 1 件のみを参照するため索引必須',
      },
    },
  ],
}

export default PlayerPositions
