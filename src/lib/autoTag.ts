/**
 * 動画自動タグ付け（要求 2-10 / ADR-010）
 * ML は使わず、ショット・スコアのメタデータからルールベースでタグを決定する。
 * Videos.ts の admin 説明が参照する実装本体。seed（videos.ts）と将来の
 * 運用ジョブ（新規ショット動画登録時のタグ付け）の両方から利用できるよう
 * 純粋関数として独立させている。
 */

export const VIDEO_TAGS = [
  'eagle',
  'birdie',
  'hole_in_one',
  'long_putt',
  'nice_shot',
  'approach',
  'bunker_save',
  'drive',
] as const
export type VideoTag = (typeof VIDEO_TAGS)[number]

export type AutoTagInput = {
  shotType: 'tee' | 'approach' | 'bunker' | 'recovery' | 'putt' | 'penalty'
  holePar: number
  holeResult?: 'eagle' | 'birdie' | 'par' | 'bogey' | 'double_or_worse'
  strokesOnHole?: number
  distanceYards?: number
  remainingYards?: number
}

/** ショット 1 本のメタデータからタグ候補を算出する（補-2-10-2） */
export const computeAutoTags = (input: AutoTagInput): VideoTag[] => {
  const tags = new Set<VideoTag>()

  if (input.strokesOnHole === 1) tags.add('hole_in_one')
  if (input.holeResult === 'eagle') tags.add('eagle')
  if (input.holeResult === 'birdie') tags.add('birdie')

  if (input.shotType === 'putt' && (input.distanceYards ?? 0) >= 20) tags.add('long_putt')
  if (input.shotType === 'approach') {
    tags.add('approach')
    if ((input.remainingYards ?? 99) <= 3) tags.add('nice_shot')
  }
  if (input.shotType === 'bunker' && input.holeResult !== 'double_or_worse') tags.add('bunker_save')
  if (input.shotType === 'tee' && input.holePar >= 4) tags.add('drive')

  return [...tags]
}

export default computeAutoTags
