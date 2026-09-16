import type { Endpoint, PayloadRequest } from 'payload'

import { isStaff } from '../access'
import { computeSponsorReport } from '../lib/sponsorReport'
import { badRequest, forbidden, notFound, okJson, unauthorized } from './lib/http'

/**
 * スポンサーレポート（要求 8-4 / 補-8-4-1 / T-15-8）
 * GET /api/reports/sponsor?sponsorId=&from=&to=
 *
 * 表示回数 / クリック数 / CTR / 動画視聴時間合計 / 平均視聴完了率 を返す（補-8-4-1）。
 * 集計本体は src/lib/sponsorReport.ts（Sponsors 管理画面の仮想フィールドと共有）。
 *
 * 権限（補-8-9-2 / 受け入れ基準）:
 * - `sponsor` ロールは自社（`req.user.sponsor`）以外の sponsorId を指定できない
 *   （指定しなければ自社が自動的に使われる）。自社の紐付けが無い sponsor ユーザーは 403。
 * - `admin` / `editor` / `operator` は任意の sponsorId を指定できる（sponsorId 必須）。
 * - それ以外（fan・未ログイン）は 403。
 *
 * このエンドポイントは `reports` という slug のコレクションが存在しないため、
 * src/endpoints/index.ts のルートレベルに登録して問題ない。
 */

type SponsorUser = { id?: number | string; role?: string; sponsor?: number | { id?: number | string } | null }

const ownSponsorIdOf = (user: SponsorUser | null | undefined): number | undefined => {
  const sponsor = user?.sponsor
  if (sponsor === null || sponsor === undefined) return undefined
  const id = typeof sponsor === 'object' ? sponsor.id : sponsor
  return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
}

export const sponsorReportEndpoint: Endpoint = {
  path: '/reports/sponsor',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized('ログインが必要です')
    const user = req.user as unknown as SponsorUser

    const query = req.query as Record<string, unknown>
    const sponsorIdRaw = query.sponsorId
    const requestedSponsorId =
      typeof sponsorIdRaw === 'string' && sponsorIdRaw.trim() !== ''
        ? Number(sponsorIdRaw)
        : typeof sponsorIdRaw === 'number'
          ? sponsorIdRaw
          : undefined

    let sponsorId: number
    if (user.role === 'sponsor') {
      const ownId = ownSponsorIdOf(user)
      if (ownId === undefined) {
        return forbidden('自社スポンサーの紐付けがありません')
      }
      if (requestedSponsorId !== undefined && requestedSponsorId !== ownId) {
        // 補-8-9-2 / 受け入れ基準: sponsor ロールは他社データを見られない
        return forbidden('他社のスポンサーレポートは参照できません')
      }
      sponsorId = ownId
    } else if (isStaff(user as never)) {
      if (requestedSponsorId === undefined) {
        return badRequest('sponsorId は必須です', 'sponsorId')
      }
      sponsorId = requestedSponsorId
    } else {
      return forbidden('この操作は許可されていません')
    }

    // select で adReportSummary（この関数がこれから呼ぶのと同じ集計を行う仮想フィールド）を除外し、
    // 存在確認のためだけに二重に集計処理が走らないようにする
    const sponsor = await req.payload
      .findByID({
        collection: 'sponsors',
        id: sponsorId,
        depth: 0,
        overrideAccess: true,
        select: { name: true },
      })
      .catch(() => null)
    if (!sponsor) return notFound('スポンサーが見つかりませんでした')

    const from = typeof query.from === 'string' ? query.from : undefined
    const to = typeof query.to === 'string' ? query.to : undefined
    if (from && Number.isNaN(new Date(from).getTime())) return badRequest('from が不正な日時です', 'from')
    if (to && Number.isNaN(new Date(to).getTime())) return badRequest('to が不正な日時です', 'to')

    const report = await computeSponsorReport(req.payload, sponsorId, { from, to })

    return okJson({
      sponsor: { id: sponsor.id, name: (sponsor as { name?: string }).name },
      ...report,
    })
  },
}

export default sponsorReportEndpoint
