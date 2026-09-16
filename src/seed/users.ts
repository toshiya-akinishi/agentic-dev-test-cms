/**
 * ユーザーアカウント（06-test-data.md 5章）とユーザー行動データ
 * （favorites / likes / notification-settings / device-tokens / ticket-orders / guest-sessions）
 */
import type { SeedCtx } from './context'
import { bump } from './context'
import { streamFor } from './rng'
import { addDays, iso } from './util'

const PASSWORD = process.env.SEED_USER_PASSWORD || 'Passw0rd!'

export type UsersSeedResult = {
  ids: Record<'admin' | 'editor' | 'operator' | 'sponsor' | 'fan1' | 'fan2' | 'fan3' | 'fan4', number>
}

export const seedUsers = async (ctx: SeedCtx, ticketTypeIds: number[]): Promise<UsersSeedResult> => {
  const rng = streamFor('users')

  const mk = async (
    email: string,
    role: 'admin' | 'editor' | 'operator' | 'sponsor' | 'fan',
    displayName: string,
    extra: Record<string, unknown> = {},
  ) => {
    const doc = await ctx.payload.create({
      collection: 'users',
      data: {
        email,
        password: PASSWORD,
        role,
        displayName,
        onboardingCompleted: true,
        notificationMaster: true,
        agreedTermsVersion: '1.0',
        ...extra,
      },
      overrideAccess: true,
      depth: 0,
    })
    return doc.id as number
  }

  const adminId = await mk('admin@example.com', 'admin', '管理者アカウント')
  const editorId = await mk('editor@example.com', 'editor', '編集者アカウント')
  const operatorId = await mk('operator@example.com', 'operator', '運営アカウント')
  const sponsorId = await mk('sponsor@example.com', 'sponsor', 'スポンサー担当者', {
    sponsor: ctx.sponsors[0]?.id,
  })
  const fan1Id = await mk('fan1@example.com', 'fan', 'ファン太郎', {
    twoFactorEnabled: false,
    golfExperienceYears: 5,
  })
  const fan2Id = await mk('fan2@example.com', 'fan', 'ファン花子', {
    twoFactorEnabled: true,
    twoFactorSecret: 'JBSWY3DPEHPK3PXP', // seed 用ダミー TOTP シークレット
    golfExperienceYears: 12,
  })
  const fan3Id = await mk('fan3@example.com', 'fan', 'ファン次郎', {
    twoFactorEnabled: false,
  })
  const fan4Id = await mk('fan4@example.com', 'fan', 'ファン美咲', {
    twoFactorEnabled: false,
  })

  ctx.users.admin = adminId
  ctx.users.editor = editorId
  ctx.users.operator = operatorId
  ctx.users.sponsor = sponsorId
  ctx.users.fan1 = fan1Id
  ctx.users.fan2 = fan2Id
  ctx.users.fan3 = fan3Id
  ctx.users.fan4 = fan4Id

  // --- お気に入り選手（favorites 合計 24件: fan1=8 / fan2=10(上限) / fan3=0 / fan4=6）
  const favoritesPlan: { userId: number; count: number }[] = [
    { userId: fan1Id, count: 8 },
    { userId: fan2Id, count: 10 },
    { userId: fan3Id, count: 0 },
    { userId: fan4Id, count: 6 },
  ]
  for (const { userId, count } of favoritesPlan) {
    const picks = rng.sample(ctx.players, count)
    for (let i = 0; i < picks.length; i++) {
      await ctx.payload.create({
        collection: 'favorites',
        data: { owner: userId, player: picks[i]!.id, order: i },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'favorites')
    }
  }

  // --- いいね（合計 40件: fan1=15 / fan2=10 / fan3=5 / fan4=10）動画への いいね
  const allVideoLikeTargets = await ctx.payload.find({
    collection: 'videos',
    limit: 60,
    depth: 0,
    overrideAccess: true,
    sort: '-publishedAt',
  })
  const videoIds = allVideoLikeTargets.docs.map((d) => d.id as number)
  const likesPlan: { userId: number; count: number }[] = [
    { userId: fan1Id, count: 15 },
    { userId: fan2Id, count: 10 },
    { userId: fan3Id, count: 5 },
    { userId: fan4Id, count: 10 },
  ]
  for (const { userId, count } of likesPlan) {
    const picks = rng.sample(videoIds, Math.min(count, videoIds.length))
    for (const videoId of picks) {
      await ctx.payload.create({
        collection: 'likes',
        data: { owner: userId, video: videoId },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'likes')
    }
  }

  // --- 通知設定（ユーザーごとに 1 件 = 8件）
  for (const userId of [adminId, editorId, operatorId, sponsorId, fan1Id, fan2Id, fan3Id, fan4Id]) {
    const favs = await ctx.payload.find({
      collection: 'favorites',
      where: { owner: { equals: userId } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    await ctx.payload.create({
      collection: 'notification-settings',
      data: {
        owner: userId,
        master: true,
        emergency: true,
        titleRace: userId === fan1Id || userId === fan2Id,
        perPlayer: favs.docs.slice(0, 3).map((f) => ({
          player: (f as { player: number }).player,
          birdie: true,
          eagle: true,
          bogeyOrWorse: false,
          cutLineChange: false,
          top10: false,
          startReminder30: true,
          startReminder15: false,
          goodScore: false,
        })),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'notification-settings')
  }

  // --- デバイストークン（fan ユーザー + ゲスト端末）
  let tokenSeq = 0
  for (const userId of [fan1Id, fan2Id, fan3Id, fan4Id]) {
    await ctx.payload.create({
      collection: 'device-tokens',
      data: {
        token: `seed-token-user-${userId}-${tokenSeq++}`,
        platform: rng.bool() ? 'ios' : 'android',
        owner: userId,
        lastActiveAt: iso(ctx.today),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'device-tokens')
  }
  for (let i = 0; i < 3; i++) {
    await ctx.payload.create({
      collection: 'device-tokens',
      data: {
        token: `seed-token-guest-${i}`,
        platform: i % 2 === 0 ? 'ios' : 'android',
        deviceId: `seed-guest-device-000${i + 1}`,
        lastActiveAt: iso(addDays(ctx.today, -i)),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'device-tokens')
  }

  // --- ゲストセッション
  for (let i = 0; i < 2; i++) {
    await ctx.payload.create({
      collection: 'guest-sessions',
      data: {
        deviceId: `seed-guest-device-000${i + 1}`,
        lastSeenAt: iso(ctx.today),
        preferences: { onboardingCompleted: true },
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'guest-sessions')
  }

  // --- チケット注文（合計 6件: fan1=2 / fan2=2 / fan4=2 / fan3=0）
  const ticketPlan: { userId: number; count: number }[] = [
    { userId: fan1Id, count: 2 },
    { userId: fan2Id, count: 2 },
    { userId: fan4Id, count: 2 },
  ]
  let orderSeq = 1
  for (const { userId, count } of ticketPlan) {
    for (let i = 0; i < count; i++) {
      const ticketType = rng.pick(ticketTypeIds)
      const orderNo = `ORD-${String(orderSeq).padStart(6, '0')}`
      orderSeq++
      await ctx.payload.create({
        collection: 'ticket-orders',
        data: {
          orderNo,
          user: userId,
          ticketType,
          quantity: rng.int(1, 2),
          amount: rng.pick([5000, 12000, 3000]),
          status: 'paid',
          paymentRef: `MOCK-${orderNo}`,
          qrPayload: `JTOUR-QR-${orderNo}`,
          purchasedAt: iso(addDays(ctx.today, -rng.int(1, 20))),
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'ticket-orders')
    }
  }

  return {
    ids: {
      admin: adminId,
      editor: editorId,
      operator: operatorId,
      sponsor: sponsorId,
      fan1: fan1Id,
      fan2: fan2Id,
      fan3: fan3Id,
      fan4: fan4Id,
    },
  }
}
