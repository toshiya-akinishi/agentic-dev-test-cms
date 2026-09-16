import type { CollectionConfig } from 'payload'
import { AuthenticationError } from 'payload'

import {
  ROLE_OPTIONS,
  adminFieldOnly,
  adminFieldOnlyNotSelf,
  adminOnly,
  adminPanelAccess,
  isAdmin,
} from '../access'
import { accountDeletionEndpoint } from '../endpoints/accountDeletion'

/**
 * ユーザー（要求 6-2〜6-8）
 * Payload auth を有効化。ロールは 8-9 のアクセス制御に使う。
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'ユーザー', plural: 'ユーザー' },
  admin: {
    group: 'アカウント',
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'role', 'createdAt'],
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30日
    maxLoginAttempts: 5, // 補-6-2-3
    lockTime: 15 * 60 * 1000, // 15分
  },
  hooks: {
    // 6-7 / 補-6-7-1: 論理削除済み（退会済み）アカウントはログイン不可にする
    beforeLogin: [
      ({ req, user }) => {
        if ((user as { deletedAt?: string | null } | null)?.deletedAt) {
          throw new AuthenticationError(req.t)
        }
      },
    ],
  },
  // POST /api/users/me/delete（6-7 / T-05-9）。相対パス /me/delete で登録する理由は
  // src/endpoints/accountDeletion.ts のコメントを参照
  endpoints: [accountDeletionEndpoint],
  access: {
    // 自分自身、または admin のみ参照可
    read: ({ req }) => {
      if (isAdmin(req.user as never)) return true
      if (req.user?.id) return { id: { equals: req.user.id } }
      return false
    },
    create: () => true, // 新規登録（6-4）
    update: ({ req }) => {
      if (isAdmin(req.user as never)) return true
      if (req.user?.id) return { id: { equals: req.user.id } }
      return false
    },
    delete: adminOnly,
    admin: adminPanelAccess, // fan は管理画面に入れない
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      label: 'ロール',
      required: true,
      defaultValue: 'fan',
      options: ROLE_OPTIONS,
      access: {
        // ロール変更は admin のみ（補-8-9-3）
        create: adminFieldOnly,
        // 補-8-9-3: 自分自身のロールは変更できない
        update: adminFieldOnlyNotSelf,
      },
      admin: {
        position: 'sidebar',
        description: '補-8-9-3。ロール変更は admin のみ可能。自分自身のロールは変更できません',
      },
    },
    {
      name: 'sponsor',
      type: 'relationship',
      relationTo: 'sponsors',
      label: '所属スポンサー',
      admin: {
        position: 'sidebar',
        description: 'sponsor ロールの場合、このスポンサーのデータのみ閲覧できます（補-8-9-2）',
        condition: (data) => data?.role === 'sponsor',
      },
    },
    { name: 'displayName', type: 'text', label: '表示名', required: true },

    // --- プロフィール（6-5 / 補-6-5-1, 補-6-5-2: 必須は表示名とメールのみ） ---
    {
      type: 'collapsible',
      label: 'プロフィール',
      fields: [
        { name: 'fullName', type: 'text', label: '氏名' },
        { name: 'birthYear', type: 'number', label: '生年（年のみ）', min: 1900, max: 2030 },
        {
          name: 'gender',
          type: 'select',
          label: '性別',
          options: [
            { label: '男性', value: 'male' },
            { label: '女性', value: 'female' },
            { label: 'その他', value: 'other' },
            { label: '回答しない', value: 'undisclosed' },
          ],
        },
        { name: 'postalCode', type: 'text', label: '郵便番号' },
        { name: 'prefecture', type: 'text', label: '都道府県' },
        { name: 'address', type: 'text', label: '住所' },
        { name: 'phone', type: 'text', label: '電話番号' },
        { name: 'golfExperienceYears', type: 'number', label: 'ゴルフ歴（年）', min: 0 },
        { name: 'favoritePlayerText', type: 'text', label: '好きな選手（自由記述）' },
        { name: 'avatar', type: 'upload', relationTo: 'media', label: 'アバター' },
        {
          name: 'snsAccounts',
          type: 'array',
          label: 'SNS アカウント',
          fields: [
            {
              name: 'provider',
              type: 'select',
              required: true,
              options: [
                { label: 'Google', value: 'google' },
                { label: 'Apple', value: 'apple' },
                { label: 'LINE', value: 'line' },
                { label: 'X', value: 'x' },
                { label: 'Instagram', value: 'instagram' },
              ],
            },
            { name: 'accountId', type: 'text', required: true, label: 'メール/外部ID' },
            {
              name: 'linkedAt',
              type: 'date',
              label: '連携日時',
              admin: { description: '補-6-4-1。/api/auth/social/:provider (mode=link) で設定' },
            },
          ],
        },
        {
          // 補-4-6-2: 選手の使用ギア画面で「自分と同じ」バッジを出すために使う
          name: 'golfClubSetting',
          type: 'array',
          label: '使用クラブ設定',
          fields: [
            {
              name: 'category',
              type: 'select',
              required: true,
              options: [
                { label: 'ドライバー', value: 'driver' },
                { label: 'アイアン', value: 'iron' },
                { label: 'ウェッジ', value: 'wedge' },
                { label: 'パター', value: 'putter' },
                { label: 'ボール', value: 'ball' },
                { label: 'ウェア', value: 'wear' },
                { label: 'シューズ', value: 'shoes' },
              ],
            },
            { name: 'brand', type: 'text', required: true },
            { name: 'model', type: 'text' },
          ],
        },
      ],
    },

    // --- セキュリティ（6-2 / 補-6-2-2） ---
    {
      type: 'collapsible',
      label: 'セキュリティ',
      fields: [
        { name: 'twoFactorEnabled', type: 'checkbox', label: '2段階認証', defaultValue: false },
        {
          name: 'twoFactorSecret',
          type: 'text',
          label: 'TOTP シークレット',
          // API レスポンスにも一切出さない（enroll/verify/login-verify エンドポイントは
          // overrideAccess: true でのみ読み書きする）
          access: { read: () => false },
          admin: { hidden: true },
        },
        {
          name: 'twoFactorRecoveryCodes',
          type: 'json',
          label: 'リカバリコード（ハッシュ化済み）',
          access: { read: () => false },
          admin: { hidden: true, description: '発行時に平文で 1 回だけ表示し、保存時は SHA-256 ハッシュのみを保持する' },
        },
      ],
    },

    // --- 状態フラグ ---
    { name: 'onboardingCompleted', type: 'checkbox', label: 'オンボーディング完了', defaultValue: false },
    {
      name: 'notificationMaster',
      type: 'checkbox',
      label: '通知マスタースイッチ',
      defaultValue: true,
      admin: { description: '6-16。OFF でも緊急通知（1-23）は配信されます' },
    },
    {
      name: 'agreedTermsVersion',
      type: 'text',
      label: '同意した規約バージョン',
      admin: { description: '補-6-15-2' },
    },
    {
      name: 'deletedAt',
      type: 'date',
      label: '退会日時',
      admin: { description: '6-7 論理削除。値がある場合はログイン不可', position: 'sidebar' },
    },
  ],
}

export default Users
