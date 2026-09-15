import type { Field, GroupField } from 'payload'

/**
 * 緯度経度フィールド。
 * Payload の `point` 型は SQLite アダプタで扱えないため、
 * lat/lng の group で表現する（docs/02-data-model.md の `point` はすべてこれ）。
 */
export const locationField = (
  name: string,
  label: string,
  opts: { required?: boolean; description?: string } = {},
): GroupField => ({
  name,
  type: 'group',
  label,
  admin: { description: opts.description },
  fields: [
    {
      name: 'lat',
      type: 'number',
      label: '緯度',
      required: opts.required,
      min: -90,
      max: 90,
      admin: { step: 0.0000001 },
    },
    {
      name: 'lng',
      type: 'number',
      label: '経度',
      required: opts.required,
      min: -180,
      max: 180,
      admin: { step: 0.0000001 },
    },
  ],
})

/**
 * 所有者フィールド（補-6-1-1）。
 * ログインユーザーは owner、ゲストは deviceId で自分のレコードを識別する。
 * どちらか一方が入っていればよい。
 */
export const ownerFields = (): Field[] => [
  {
    name: 'owner',
    type: 'relationship',
    relationTo: 'users',
    label: 'ユーザー',
    index: true,
    admin: { description: 'ログインユーザーの場合に設定' },
  },
  {
    name: 'deviceId',
    type: 'text',
    label: 'デバイスID',
    index: true,
    admin: { description: 'ゲスト（未ログイン）の場合に設定' },
  },
]
