import type { CollectionBeforeChangeHook, CollectionConfig, Where } from 'payload'

import { ValidationError } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { ownerFields } from '../fields'

/** 1 ユーザー（または 1 端末）あたりのお気に入り選手上限（ADR-006 / 補-4-12-1） */
export const FAVORITE_PLAYER_LIMIT = 10

/**
 * サーバー側での上限強制（ADR-006 / 補-4-12-1）。
 * アプリ側のチェックはバイパスされ得るため、作成時にここでも件数を数えて拒否する。
 * このコレクションは選手お気に入り専用（観戦ガイド／選手ガイドどちらから登録してもここに集約される、補-4-12-2）
 * なので、他の種別との区別なくコレクション全件をそのままカウントすればよい。
 */
const enforceFavoritePlayerLimit: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const ownerId = (data?.owner as string | number | undefined) ?? (req.user?.id as string | number | undefined)
  const deviceId = data?.deviceId as string | undefined

  const where: Where | undefined = ownerId
    ? { owner: { equals: ownerId } }
    : deviceId
      ? { deviceId: { equals: deviceId } }
      : undefined

  // owner/deviceId のどちらも無い場合は access(createOwnOrDevice) 側で既に弾かれているはずだが、念のため素通しする
  if (!where) return data

  const { totalDocs } = await req.payload.count({
    collection: 'favorites',
    where,
    overrideAccess: true,
    req,
  })

  if (totalDocs >= FAVORITE_PLAYER_LIMIT) {
    throw new ValidationError({
      collection: 'favorites',
      errors: [
        {
          path: 'player',
          message: `お気に入り選手は 1 ユーザー（または 1 端末）あたり最大 ${FAVORITE_PLAYER_LIMIT} 名までです（ADR-006 / 補-4-12-1）。登録済みのお気に入りを削除してから再度お試しください。`,
        },
      ],
      req,
    })
  }

  return data
}

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
      `4-12 / 4-13。1 ユーザー（または 1 端末）あたりの上限は ${FAVORITE_PLAYER_LIMIT} 名（ADR-006 / 補-4-12-1）。` +
      'アプリ側に加え、beforeChange フックでサーバー側でも作成時に強制する',
  },
  access: {
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  hooks: {
    beforeChange: [enforceFavoritePlayerLimit],
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
