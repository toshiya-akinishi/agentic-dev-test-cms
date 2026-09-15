import type { Payload } from 'payload'

import type { LatLng } from './util'

export type SeasonRef = { id: number; year: number }

export type HoleRef = {
  id: number
  number: number
  par: number
  yards: number
  tee: LatLng
  green: LatLng
  /** バンカーのポリゴン（endLie 逆算に使用） */
  bunkers: [number, number][][]
  /** 池・OB のポリゴン（endLie 逆算に使用） */
  water: [number, number][][]
}

export type CourseRef = {
  id: number
  venueId: number
  name: string
  holes: HoleRef[]
}

export type VenueRef = {
  id: number
  slug: string
  name: string
  center: LatLng
  /** 施設ピンを収めるバウンディングボックス */
  bounds: { swLat: number; swLng: number; neLat: number; neLng: number }
  course: CourseRef
}

export type PlayerRef = {
  id: number
  index: number
  name: string
  nameEn: string
  slug: string
  isStar: boolean
  /** 実力（小さいほど強い）: スコア生成のベース */
  skill: number
  photoId?: number
}

export type TournamentKind = 'finished' | 'live' | 'scheduled' | 'cancelled' | 'postponed'

export type RoundRef = {
  id: number
  number: number
  date: Date
  status: 'scheduled' | 'live' | 'finished' | 'suspended'
}

export type TournamentRef = {
  id: number
  code: string
  slug: string
  name: string
  kind: TournamentKind
  status: 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed'
  seasonId: number
  venue: VenueRef
  startDate: Date
  endDate: Date
  rounds: RoundRef[]
  /** 出場選手 */
  field: PlayerRef[]
  cutLineAfterRound: number
}

export type SeedCtx = {
  payload: Payload
  /** seed 実行日（00:00 UTC） */
  today: Date
  seasons: SeasonRef[]
  venues: VenueRef[]
  players: PlayerRef[]
  sponsors: { id: number; name: string }[]
  tournaments: TournamentRef[]
  /** 動画 ID プール（ショット紐付け・広告などで参照） */
  videoIds: number[]
  shotVideoIds: number[]
  mediaIds: { genericPhotos: number[] }
  users: Record<string, number>
  counts: Record<string, number>
}

export const bump = (ctx: SeedCtx, key: string, n = 1): void => {
  ctx.counts[key] = (ctx.counts[key] ?? 0) + n
}
