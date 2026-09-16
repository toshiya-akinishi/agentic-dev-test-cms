import type { CollectionConfig, FieldAccess } from 'payload'

import { adminOnly, anyone, isStaff } from '../access'
import { computeSponsorReport } from '../lib/sponsorReport'

/**
 * 補-8-4-1: レポート用仮想フィールドの参照権限。staff（admin/editor/operator）は全件、
 * sponsor ロールは自社の Sponsor ドキュメントのみ参照できる（他社の集計値を見せない）。
 */
const reportFieldAccess: FieldAccess = ({ req, id }) => {
  if (isStaff(req.user as never)) return true
  const user = req.user as { role?: string; sponsor?: number | { id?: number | string } | null } | null | undefined
  if (user?.role !== 'sponsor') return false
  const sponsor = user.sponsor
  const ownId = sponsor && typeof sponsor === 'object' ? sponsor.id : sponsor
  return ownId !== undefined && ownId !== null && id !== undefined && String(ownId) === String(id)
}

/**
 * スポンサー（要求 8-3, 8-5）
 * `ad-creatives` の出稿主体。`users.sponsor` から参照され、
 * sponsor ロールのユーザーは自社に紐づくクリエイティブのみ閲覧できる（補-8-9-2）。
 */
export const Sponsors: CollectionConfig = {
  slug: 'sponsors',
  labels: { singular: 'スポンサー', plural: 'スポンサー' },
  admin: {
    group: 'スポンサー・広告',
    useAsTitle: 'name',
    defaultColumns: ['name', 'tier', 'contractFrom', 'contractTo'],
    description: '8-3 / 8-5。補-8-9-2 により sponsor ロールのユーザーは自社データのみ参照できる',
  },
  access: {
    // アプリにロゴ等を出すため参照は公開（8-5）。編集は admin のみ（8-9）
    read: anyone,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'スポンサー名',
      required: true,
      index: true,
      admin: { description: '8-3' },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: 'ロゴ',
      admin: { description: '8-4。表示回数レポートの対象となるスポンサーロゴ' },
    },
    {
      name: 'tier',
      type: 'select',
      label: '契約ティア',
      options: [
        { label: 'プラチナ', value: 'platinum' },
        { label: 'ゴールド', value: 'gold' },
        { label: 'シルバー', value: 'silver' },
        { label: 'ブロンズ', value: 'bronze' },
      ],
      admin: {
        position: 'sidebar',
        description: '8-3。スポンサー価値に応じた区分（元表に値の定義がないため 4 段階で仮置き）',
      },
    },
    {
      name: 'contractFrom',
      type: 'date',
      label: '契約開始日',
      admin: { description: '8-3' },
    },
    {
      name: 'contractTo',
      type: 'date',
      label: '契約終了日',
      admin: { description: '8-3' },
    },
    {
      name: 'landingUrl',
      type: 'text',
      label: 'ランディングURL',
      admin: { description: '8-5。ロゴ・バナータップ時の遷移先（クリエイティブ側の linkUrl が優先）' },
    },
    {
      // 補-8-4-1: CMS 管理画面のレポートビュー。専用のカスタム管理画面（React コンポーネント）は
      // SIMPL 方針（8-4 は自前集計 API・BI 連携なし）と実装コストを踏まえて見送り、
      // 代わりに Sponsors 詳細画面から直接レポートが読める仮想フィールドとして提供する。
      // 保存はされず、閲覧の都度 computeSponsorReport で再計算する（過去30日固定。詳細な期間指定は
      // GET /api/reports/sponsor を使う）。
      name: 'adReportSummary',
      type: 'json',
      label: '広告レポート（直近30日・自動集計）',
      virtual: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          '補-8-4-1。表示回数/クリック/CTR/視聴時間合計/平均視聴完了率を過去30日分で自動集計（保存されない）。' +
          'sponsor ロールは自社分のみ表示（他社は非表示）。期間を指定したい場合は GET /api/reports/sponsor を使用',
      },
      access: { read: reportFieldAccess },
      hooks: {
        afterRead: [
          async ({ req, data }) => {
            const sponsorId = (data as { id?: unknown } | undefined)?.id
            const id = typeof sponsorId === 'number' ? sponsorId : typeof sponsorId === 'string' ? Number(sponsorId) : undefined
            if (id === undefined || Number.isNaN(id)) return null
            try {
              return await computeSponsorReport(req.payload, id)
            } catch (err) {
              req.payload.logger.warn(`Sponsors.adReportSummary の集計に失敗: ${String(err)}`)
              return null
            }
          },
        ],
      },
    },
  ],
}

export default Sponsors
