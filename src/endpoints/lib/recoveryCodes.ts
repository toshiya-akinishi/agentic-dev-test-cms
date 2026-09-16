/**
 * 2 段階認証のリカバリコード（補-6-2-2）。
 * 発行時のみ平文を返し、保存時はハッシュ化する。
 */
import { createHash, randomInt } from 'node:crypto'

// 紛らわしい文字（0/O, 1/I 等）を除いたアルファベット
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const randomCode = (): string => {
  let raw = ''
  for (let i = 0; i < 10; i++) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

/** 10 個のリカバリコード（平文）を生成する */
export const generateRecoveryCodes = (count = 10): string[] =>
  Array.from({ length: count }, () => randomCode())

const normalize = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, '')

/** 保存用ハッシュ（SHA-256）。リカバリコードは十分なエントロピーを持つランダム値のため使い捨てハッシュで足りる */
export const hashRecoveryCode = (code: string): string =>
  createHash('sha256').update(normalize(code)).digest('hex')

export const hashRecoveryCodes = (codes: string[]): string[] => codes.map(hashRecoveryCode)

/** 一致するハッシュ済みコードの index を返す（見つからなければ -1） */
export const findRecoveryCodeIndex = (hashedCodes: unknown, candidate: string): number => {
  if (!Array.isArray(hashedCodes)) return -1
  const target = hashRecoveryCode(candidate)
  return (hashedCodes as unknown[]).findIndex((h) => h === target)
}
