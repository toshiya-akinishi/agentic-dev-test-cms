import type { CollectionConfig } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { ownerFields } from '../fields'

/**
 * いいね（要求 2-11 動画のいいね / 1-45 お気に入りショット）
 *
 * ownerFields() により、ログインユーザー（owner）とゲスト（deviceId）の
 * どちらでも登録できる（補-6-1-1）。
 */
export const Likes: CollectionConfig = {
  slug: 'likes',
  labels: { singular: 'いいね', plural: 'いいね' },
  admin: {
    group: 'ユーザー行動',
    useAsTitle: 'id',
    defaultColumns: ['video', 'shot', 'owner', 'deviceId', 'createdAt'],
    description:
      '2-11（動画のいいね）／1-45（お気に入りショット）。' +
      '1 レコードにつき video と shot の「どちらか一方」のみを設定する',
  },
  access: {
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  fields: [
    // owner（→users）/ deviceId（text）: 補-6-1-1
    ...ownerFields(),
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: '動画',
      index: true,
      admin: { description: '2-11 動画のいいね。shot とはどちらか一方のみを設定する' },
    },
    {
      name: 'shot',
      type: 'relationship',
      relationTo: 'shots',
      label: 'ショット',
      index: true,
      admin: { description: '1-45 お気に入りショット。video とはどちらか一方のみを設定する' },
    },
  ],
}

export default Likes
