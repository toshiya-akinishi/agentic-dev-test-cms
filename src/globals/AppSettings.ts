import type { GlobalConfig } from 'payload'

import { adminOnly, anyone } from '../access'

/**
 * アプリ設定（docs/02-data-model.md G. 設定）
 * アプリ起動時に `GET /api/globals/app-settings` で取得して利用する。
 */
export const AppSettings: GlobalConfig = {
  slug: 'app-settings',
  label: 'アプリ設定',
  admin: {
    group: '設定',
    description: 'アプリ起動時に取得される共通設定値',
  },
  access: {
    read: anyone,
    update: adminOnly,
  },
  fields: [
    {
      name: 'liveScorePollIntervalSec',
      type: 'number',
      label: 'ライブスコア更新間隔（秒）',
      required: true,
      defaultValue: 15,
      min: 5,
      admin: { description: 'ライブ系画面のポーリング間隔' },
    },
    {
      name: 'favoritePlayerLimit',
      type: 'number',
      label: 'お気に入り選手の上限人数',
      required: true,
      defaultValue: 10,
      min: 1,
      admin: { description: '補-4-12-1。上限 10 名' },
    },
    {
      name: 'lowBandwidthThresholdKbps',
      type: 'number',
      label: '低帯域判定のしきい値（kbps）',
      min: 0,
      admin: { description: 'これを下回る回線では低画質・軽量表示に切り替える' },
    },
    {
      name: 'offlineCacheTtlHours',
      type: 'number',
      label: 'オフラインキャッシュ保持時間（時間）',
      required: true,
      defaultValue: 24,
      min: 0,
      admin: { description: 'オフライン時に表示するキャッシュの有効期限' },
    },
    {
      name: 'goodScoreToPar',
      type: 'number',
      label: '「好スコア」判定の通算スコア',
      required: true,
      defaultValue: -4,
      admin: {
        description:
          '補-4-15-1。1 ラウンドでこの通算スコア以下に到達した時点、または 1 ホールでイーグル以上を「好スコア」とする',
      },
    },
    {
      name: 'maintenanceMode',
      type: 'checkbox',
      label: 'メンテナンスモード',
      defaultValue: false,
      admin: { description: 'ON の場合、アプリ側でメンテナンス画面を表示する' },
    },
    {
      name: 'minimumAppVersion',
      type: 'text',
      label: '最低アプリバージョン',
      admin: { description: 'これ未満のバージョンでは強制アップデートを促す' },
    },
  ],
}

export default AppSettings
