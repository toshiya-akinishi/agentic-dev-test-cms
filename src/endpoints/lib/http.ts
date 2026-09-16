/**
 * カスタムエンドポイント共通ヘルパー。
 *
 * エラー形式は docs/03-api-spec.md 4章「共通仕様」の
 * `{ errors: [{ message, field? }] }`（Payload 標準のエラー形式）に合わせる。
 */

export type ApiErrorItem = { field?: string; message: string }

/** `{ errors: [...] }` 形式のエラーレスポンスを返す */
export const errorJson = (status: number, message: string, field?: string): Response =>
  Response.json(
    {
      errors: [field ? { field, message } : { message }] as ApiErrorItem[],
    },
    { status },
  )

/** 成功レスポンス（任意の JSON ボディ） */
export const okJson = (data: unknown, status = 200): Response => Response.json(data, { status })

export const badRequest = (message: string, field?: string): Response => errorJson(400, message, field)
export const unauthorized = (message = '認証が必要です'): Response => errorJson(401, message)
export const forbidden = (message = 'この操作は許可されていません'): Response => errorJson(403, message)
export const notFound = (message = '見つかりませんでした'): Response => errorJson(404, message)
export const serverError = (message = 'サーバーエラーが発生しました'): Response => errorJson(500, message)

/**
 * リクエストボディを安全に JSON パースする。
 * Payload のカスタムエンドポイントでは `req.json()` を自前で呼ぶ必要がある
 * （`req.data` は通常操作のフックでのみ利用可能）。
 */
export const readJsonBody = async <T = Record<string, unknown>>(req: {
  json?: () => Promise<unknown>
}): Promise<T> => {
  try {
    if (!req.json) return {} as T
    const body = await req.json()
    return (body ?? {}) as T
  } catch {
    return {} as T
  }
}
