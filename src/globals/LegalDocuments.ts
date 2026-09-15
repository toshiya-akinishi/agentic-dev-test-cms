import type { GlobalConfig } from 'payload'

import { anyone, editorOnly } from '../access'

/**
 * 利用規約・プライバシーポリシー（要求 6-15 / 補-6-15-1, 補-6-15-2）
 * バージョン管理し、ログイン画面とマイページの両方からリンクする。
 * 新規登録時に同意したバージョンは `users.agreedTermsVersion` に記録する。
 */
export const LegalDocuments: GlobalConfig = {
  slug: 'legal-documents',
  label: '利用規約・プライバシーポリシー',
  admin: {
    group: '設定',
    description: '6-15 / 補-6-15-1。バージョンを更新すると再同意が必要になる（補-6-15-2）',
  },
  access: {
    read: anyone,
    update: editorOnly,
  },
  fields: [
    {
      name: 'terms',
      type: 'richText',
      label: '利用規約',
      admin: { description: '6-15' },
    },
    {
      name: 'privacy',
      type: 'richText',
      label: 'プライバシーポリシー',
      admin: { description: '6-15' },
    },
    {
      name: 'version',
      type: 'text',
      label: 'バージョン',
      admin: {
        description: '補-6-15-2。`users.agreedTermsVersion` と突き合わせて再同意要否を判定する',
      },
    },
    {
      name: 'effectiveAt',
      type: 'date',
      label: '発効日時',
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: '補-6-15-1' },
    },
  ],
}

export default LegalDocuments
