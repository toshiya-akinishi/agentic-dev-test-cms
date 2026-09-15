import type { CollectionConfig } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { ownerFields } from '../fields'

/**
 * お気に入り選手（要求 4-12, 4-13 / 02-data-model.md E章）
 *
 * ownerFields() により、ログインユーザー（owner）とゲスト（deviceId）の
 * どちらでも登録できる（補-6-1-1 / 補-4-12-4）。
 * 観戦ガイドと選手ガイドのどちらから登録しても、このコレクションに集約する（補-4-12-2）。
 */
export const Favorites: CollectionConfig = {
  slug: 'favorites',
  labels: { singular: 'お気に入り選手', plural: 'お気に入り選手' },
  admin: {
    group: 'ユーザー行動',
    useAsTitle: 'player',
    defaultColumns: ['player', 'owner', 'deviceId', 'order', 'createdAt'],
    description:
      '4-12 / 4-13。1 ユーザー（または 1 端末）あたりの上限は 10 名（ADR-006 / 補-4-12-1）。' +
      '上限のチェックはアプリ／エンドポイント側で行う',
  },
  access: {
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  defaultSort: 'order',
  fields: [
    // owner（→users）/ deviceId（text）: 補-6-1-1
    ...ownerFields(),
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '選手',
      required: true,
      index: true,
      admin: { description: '4-12。お気に入り登録した選手' },
    },
    {
      name: 'order',
      type: 'number',
      label: '表示順',
      defaultValue: 0,
      admin: {
        description:
          '補-4-12-3。お気に入り一覧のドラッグ＆ドロップ並べ替え結果。' +
          'この順序はリーダーボードの絞り込み表示・通知一覧の並びにも反映する',
      },
    },
  ],
}

export default Favorites
