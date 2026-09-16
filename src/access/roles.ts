import type { Access, FieldAccess, Where } from 'payload'

/** ロール定義（要求 8-9 / docs/02-data-model.md アクセス制御表） */
export const ROLES = ['admin', 'editor', 'operator', 'sponsor', 'fan'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_OPTIONS = [
  { label: '管理者 (admin)', value: 'admin' },
  { label: '編集者 (editor)', value: 'editor' },
  { label: '運営 (operator)', value: 'operator' },
  { label: 'スポンサー (sponsor)', value: 'sponsor' },
  { label: 'ファン (fan)', value: 'fan' },
]

type UserLike = { role?: Role | null; id?: string | number } | null | undefined

export const roleOf = (user: UserLike): Role | undefined => user?.role ?? undefined

export const hasRole =
  (...roles: Role[]) =>
  (user: UserLike): boolean => {
    const r = roleOf(user)
    return !!r && roles.includes(r)
  }

export const isAdmin = hasRole('admin')
export const isEditor = hasRole('admin', 'editor')
export const isOperator = hasRole('admin', 'operator')
/** コンテンツ運用者（編集者 or 運営） */
export const isStaff = hasRole('admin', 'editor', 'operator')

/* ------------------------------------------------------------------ *
 * Access 関数
 * ------------------------------------------------------------------ */

/** 誰でも読める（公開コンテンツ） */
export const anyone: Access = () => true

/** admin のみ */
export const adminOnly: Access = ({ req }) => isAdmin(req.user as UserLike)

/** admin or editor */
export const editorOnly: Access = ({ req }) => isEditor(req.user as UserLike)

/** admin or operator */
export const operatorOnly: Access = ({ req }) => isOperator(req.user as UserLike)

/** admin / editor / operator */
export const staffOnly: Access = ({ req }) => isStaff(req.user as UserLike)

/** ログイン済みなら誰でも */
export const authenticated: Access = ({ req }) => Boolean(req.user)

/** Admin パネルへのログイン可否（fan は管理画面に入れない） */
export const adminPanelAccess = ({ req }: { req: { user?: unknown } }) =>
  hasRole('admin', 'editor', 'operator', 'sponsor')(req.user as UserLike)

/* ------------------------------------------------------------------ *
 * 所有者判定（補-6-1-1）
 * ログインユーザーは `owner`、ゲストは `deviceId` で自分のレコードを識別する。
 * ------------------------------------------------------------------ */

/** リクエストから deviceId を取り出す（ヘッダ X-Device-Id / クエリ deviceId） */
export const deviceIdOf = (req: {
  headers?: Headers | Record<string, unknown>
  searchParams?: URLSearchParams
  query?: Record<string, unknown>
}): string | undefined => {
  const h = req.headers
  let fromHeader: string | undefined
  if (h && typeof (h as Headers).get === 'function') {
    fromHeader = (h as Headers).get('x-device-id') ?? undefined
  }
  const fromQuery =
    (req.searchParams?.get?.('deviceId') as string | undefined) ??
    (typeof req.query?.deviceId === 'string' ? (req.query.deviceId as string) : undefined)
  return fromHeader || fromQuery || undefined
}

/**
 * 自分のレコードのみ（owner 一致 または deviceId 一致）。
 * admin は全件アクセス可。
 */
export const ownerOrDevice: Access = ({ req }) => {
  const user = req.user as UserLike
  if (isAdmin(user)) return true
  if (user?.id) {
    const byOwner: Where = { owner: { equals: user.id } }
    return byOwner
  }
  const deviceId = deviceIdOf(req as never)
  if (deviceId) {
    const byDevice: Where = { deviceId: { equals: deviceId } }
    return byDevice
  }
  return false
}

/** 作成は「ログイン済み」または「deviceId 提示済み」なら許可 */
export const createOwnOrDevice: Access = ({ req }) => {
  const user = req.user as UserLike
  if (user?.id) return true
  return Boolean(deviceIdOf(req as never))
}

/** admin / editor / operator は読める。それ以外は自分のレコードのみ */
export const staffOrOwner: Access = (args) => {
  if (isStaff(args.req.user as UserLike)) return true
  return ownerOrDevice(args)
}

/* ------------------------------------------------------------------ *
 * フィールドレベル
 * ------------------------------------------------------------------ */

/** admin のみ編集可（ロール変更など） */
export const adminFieldOnly: FieldAccess = ({ req }) => isAdmin(req.user as UserLike)

/**
 * ロール変更は admin のみ、かつ自分自身のロールは変更できない（補-8-9-3）。
 * `id` は更新対象ドキュメントの ID（新規作成時は undefined）。
 */
export const adminFieldOnlyNotSelf: FieldAccess = ({ req, id }) => {
  if (!isAdmin(req.user as UserLike)) return false
  const userId = (req.user as UserLike)?.id
  if (id !== undefined && userId !== undefined && String(id) === String(userId)) {
    return false
  }
  return true
}
