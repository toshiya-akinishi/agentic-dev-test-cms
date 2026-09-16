import type { CollectionBeforeChangeHook, CollectionConfig, Where } from 'payload'

import { ValidationError } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { playlistsAutoEndpoint } from '../endpoints/playlists'
import { ownerFields } from '../fields/location'

/** 1 プレイリストあたりの動画本数上限（補-2-23-1） */
export const PLAYLIST_ITEMS_LIMIT = 50
/** 1 ユーザー（または 1 端末）あたりのプレイリスト件数上限（補-2-23-1） */
export const PLAYLIST_OWNER_LIMIT = 20

/**
 * サーバー側での上限強制（要求 2-23 / 補-2-23-1）。
 * アプリ側のチェックはバイパスされ得るため、ここでも作成時にプレイリスト件数を、
 * 作成・更新時に収録動画数を数えて拒否する。
 */
const enforcePlaylistLimits: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  const errors: { path: string; message: string }[] = []

  if (operation === 'create') {
    const ownerId = (data?.owner as string | number | undefined) ?? (req.user?.id as string | number | undefined)
    const deviceId = data?.deviceId as string | undefined

    const where: Where | undefined = ownerId
      ? { owner: { equals: ownerId } }
      : deviceId
        ? { deviceId: { equals: deviceId } }
        : undefined

    // owner/deviceId のどちらも無い場合は access(createOwnOrDevice) 側で既に弾かれているはずだが、念のため素通しする
    if (where) {
      const { totalDocs } = await req.payload.count({
        collection: 'playlists',
        where,
        overrideAccess: true,
        req,
      })

      if (totalDocs >= PLAYLIST_OWNER_LIMIT) {
        errors.push({
          path: 'name',
          message: `プレイリストは 1 ユーザー（または 1 端末）あたり最大 ${PLAYLIST_OWNER_LIMIT} 件までです（補-2-23-1）。不要なプレイリストを削除してから再度お試しください。`,
        })
      }
    }
  }

  const items = data?.items
  if (Array.isArray(items) && items.length > PLAYLIST_ITEMS_LIMIT) {
    errors.push({
      path: 'items',
      message: `プレイリストに登録できる動画は最大 ${PLAYLIST_ITEMS_LIMIT} 本です（補-2-23-1）`,
    })
  }

  if (errors.length) {
    throw new ValidationError({ collection: 'playlists', errors, req })
  }

  return data
}

/**
 * プレイリスト（要求 2-23）
 * いいねした動画から自分用の再生リストを作成し、共有できる。
 * 未ログイン（ゲスト）は `deviceId` で識別する（補-6-1-1 / 補-2-11-1）。
 * 上限（1 プレイリスト最大 50 本・1 ユーザー最大 20 件、補-2-23-1）はアプリ側に加え
 * beforeChange フック（enforcePlaylistLimits）でサーバー側でも強制する。
 */
export const Playlists: CollectionConfig = {
  slug: 'playlists',
  labels: { singular: 'プレイリスト', plural: 'プレイリスト' },
  admin: {
    group: '動画',
    useAsTitle: 'name',
    defaultColumns: ['name', 'owner', 'deviceId', 'isPublic', 'createdAt'],
    description: '2-23。いいね動画から作成するユーザー個別の再生リスト',
  },
  // GET /api/playlists/auto（要求 2-15 / 補-2-15-1 / T-12-8）。コレクション独自の
  // endpoints に登録する理由は src/endpoints/playlists.ts のコメントを参照
  // （ルート登録だと /:id に奪われる）
  endpoints: [playlistsAutoEndpoint],
  access: {
    // 自分（owner）または自端末（deviceId）のレコードのみ。admin は全件
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  hooks: {
    beforeChange: [enforcePlaylistLimits],
  },
  fields: [
    { name: 'name', type: 'text', label: 'プレイリスト名', required: true },

    // owner / deviceId（補-6-1-1）
    ...ownerFields(),

    {
      name: 'items',
      type: 'relationship',
      relationTo: 'videos',
      hasMany: true,
      label: '収録動画',
      admin: {
        description: `補-2-23-1。1 プレイリスト最大 ${PLAYLIST_ITEMS_LIMIT} 本（1 ユーザー最大 ${PLAYLIST_OWNER_LIMIT} 件）。いいね動画から追加します（補-2-11-1）`,
      },
      validate: (value: unknown) => {
        if (Array.isArray(value) && value.length > PLAYLIST_ITEMS_LIMIT) {
          return `プレイリストに登録できる動画は最大 ${PLAYLIST_ITEMS_LIMIT} 本です（補-2-23-1）`
        }
        return true
      },
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      label: '公開',
      defaultValue: false,
      admin: {
        description:
          '補-2-23-2。ON の場合、shareToken 付き URL で未ログインでも閲覧できます（編集は所有者のみ）',
      },
    },
    {
      name: 'shareToken',
      type: 'text',
      label: '共有トークン',
      index: true,
      admin: {
        description:
          '補-2-23-2。共有 URL に付与するトークン。トークン経由の閲覧は専用エンドポイントで提供します',
      },
    },
  ],
}

export default Playlists
