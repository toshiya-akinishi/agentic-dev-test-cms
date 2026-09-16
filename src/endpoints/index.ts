import type { Endpoint } from 'payload'

import { guestMergeEndpoint } from './guestMerge'

/**
 * カスタムエンドポイント（docs/03-api-spec.md 3章）。
 * 1 ドメイン 1 ファイルで `src/endpoints/<domain>.ts` に書き、ここへ追加する。
 *
 * 注意: パスの最初のセグメントが既存のコレクション/グローバルのスラッグと衝突する
 * エンドポイント（例: `/rankings/latest`）はここに置かない。Payload はまず先頭セグメントを
 * コレクションスラッグとして解決するため、ここに登録してもコレクション標準の `/:id` 等に
 * 奪われる。その場合は該当コレクションの `endpoints` に相対パスで登録する
 * （例: `src/collections/Rankings.ts` の `rankingsLatestEndpoint`）。
 */
export const endpoints: Endpoint[] = [guestMergeEndpoint]
