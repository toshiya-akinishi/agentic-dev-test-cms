import type { GlobalConfig } from 'payload'

import { operatorOnly } from '../access'

/**
 * 緊急通知の CMS 発行 UI（要求 1-23 / 補-1-23-1〜4 / T-14-3）
 *
 * `src/endpoints/notificationsEmergency.ts`（`POST /api/notifications/emergency`）は
 * T-14-3 実装当初から動作しているが、Admin UI から呼び出す手段が無く、運営担当者が
 * 生の API リクエストを組み立てないと緊急通知を発行できなかった（今回埋めるギャップ）。
 *
 * データを永続化する必要は無い（発行そのものは既存エンドポイントが `notifications` レコードを
 * 作成する）ため、フィールドを一切持たない Global に `type: 'ui'` フィールド 1 つだけを置き、
 * その Component（`EmergencyNoticeForm`）にフォーム UI 一式を任せる SIMPL 実装とする。
 * 「保存」ボタンは実質使わない（フォームの送信ボタンが直接 API を叩く）ため、
 * Global 自体の read/update アクセス制御は「Admin にこのメニューが見える最低ライン」として
 * operator 以上に絞るだけに留める（実際の発行可否は最終的にエンドポイント側の isOperator が担保）。
 */
export const EmergencyBroadcast: GlobalConfig = {
  slug: 'emergency-broadcast',
  label: '緊急通知の発行',
  admin: {
    group: '通知',
    description:
      '1-23 / T-14-3。運営（operator）以上が中止・順延・中断・再開・雷警報・避難指示を全ユーザーへ即時配信します（マスタースイッチ無視・ADR-015）',
  },
  access: {
    read: operatorOnly,
    update: operatorOnly,
  },
  fields: [
    {
      name: 'emergencyForm',
      type: 'ui',
      label: '',
      admin: {
        components: {
          Field: '/admin/EmergencyNoticeForm.tsx#EmergencyNoticeForm',
        },
      },
    },
  ],
}

export default EmergencyBroadcast
