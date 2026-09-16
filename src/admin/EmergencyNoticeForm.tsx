'use client'

import React, { useEffect, useState } from 'react'

/**
 * 緊急通知の CMS 発行 UI（要求 1-23 / T-14-3）
 *
 * `src/endpoints/notificationsEmergency.ts`（`POST /api/notifications/emergency`）自体は
 * T-14-3 の実装当初から正しく動作しているが、CMS 管理画面から呼び出す UI が無く、運営担当者が
 * 生の API リクエストを組み立てないと緊急通知を発行できなかった（今回のギャップ）。
 *
 * 本コンポーネントは Payload Admin の `globals.emergency-broadcast` に埋め込む
 * `type: 'ui'` フィールドの Component で、フォーム入力からそのまま既存エンドポイントを
 * fetch で叩くだけの SIMPL 実装（データを保存する独自フィールドは持たない。あくまで
 * 「発行ボタン」の見た目を Admin 内に提供するのが目的）。
 *
 * 権限は最終的にエンドポイント側（`isOperator`）が担保する。ここでは 403 等を
 * そのままエラーメッセージとして表示するだけで、UI 側では権限チェックを行わない。
 */

const EMERGENCY_KINDS = ['中止', '順延', '中断', '再開', '雷警報', '避難指示'] as const
type EmergencyKind = (typeof EMERGENCY_KINDS)[number]

type TournamentOption = { id: number; name: string; status: string }
type RoundOption = { id: number; number: number; status: string }

type SubmitResult =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; message: string; statusUpdates?: Record<string, unknown> }
  | { kind: 'error'; message: string }

const boxStyle: React.CSSProperties = {
  border: '1px solid #dadde3',
  borderRadius: 6,
  padding: 20,
  maxWidth: 560,
  background: '#fff',
}

const rowStyle: React.CSSProperties = { marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#333' }
const inputStyle: React.CSSProperties = { padding: '6px 8px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }

export const EmergencyNoticeForm: React.FC = () => {
  const [kind, setKind] = useState<EmergencyKind>('中止')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [deepLink, setDeepLink] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [roundId, setRoundId] = useState('')

  const [tournaments, setTournaments] = useState<TournamentOption[]>([])
  const [rounds, setRounds] = useState<RoundOption[]>([])
  const [result, setResult] = useState<SubmitResult>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/tournaments?limit=100&sort=-startDate&depth=0', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setTournaments((data?.docs ?? []) as TournamentOption[])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setRoundId('')
    if (!tournamentId) {
      setRounds([])
      return
    }
    let cancelled = false
    fetch(
      `/api/rounds?where[tournament][equals]=${encodeURIComponent(tournamentId)}&sort=number&limit=10&depth=0`,
      { credentials: 'include' },
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setRounds((data?.docs ?? []) as RoundOption[])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) {
      setResult({ kind: 'error', message: '本文は必須です' })
      return
    }
    setResult({ kind: 'loading' })
    try {
      const res = await fetch('/api/notifications/emergency', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          title: title.trim() || undefined,
          body: body.trim(),
          deepLink: deepLink.trim() || undefined,
          tournamentId: tournamentId ? Number(tournamentId) : undefined,
          roundId: roundId ? Number(roundId) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.errors?.[0]?.message ?? `発行に失敗しました（HTTP ${res.status}）`
        setResult({ kind: 'error', message })
        return
      }
      setResult({ kind: 'success', message: data?.message ?? '発行しました', statusUpdates: data?.statusUpdates })
      setBody('')
      setTitle('')
      setDeepLink('')
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div style={boxStyle}>
      <p style={{ marginTop: 0, fontSize: 13, color: '#666' }}>
        補-1-23-2 / ADR-015: ユーザーの通知設定（マスタースイッチ含む）に関わらず全員へ即時配信されます。
        中止・順延・再開を選ぶと大会ステータスも連動して更新されます（大会選択時）。
        中断・再開は選択したラウンドのステータスも連動します（ラウンド選択時）。
      </p>
      <form onSubmit={handleSubmit}>
        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-kind">
            種別
          </label>
          <select
            id="emergency-kind"
            style={inputStyle}
            value={kind}
            onChange={(e) => setKind(e.target.value as EmergencyKind)}
          >
            {EMERGENCY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-title">
            タイトル（省略時は種別から自動生成）
          </label>
          <input
            id="emergency-title"
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 【大会中止】お知らせ"
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-body">
            本文 *
          </label>
          <textarea
            id="emergency-body"
            style={{ ...inputStyle, minHeight: 80, fontFamily: 'inherit' }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-tournament">
            関連大会（任意。中止/順延/再開でステータス連動）
          </label>
          <select
            id="emergency-tournament"
            style={inputStyle}
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
          >
            <option value="">（指定しない）</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.status}）
              </option>
            ))}
          </select>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-round">
            関連ラウンド（任意。中断/再開でステータス連動）
          </label>
          <select
            id="emergency-round"
            style={inputStyle}
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            disabled={rounds.length === 0}
          >
            <option value="">（指定しない）</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                第{r.number}ラウンド（{r.status}）
              </option>
            ))}
          </select>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="emergency-deeplink">
            ディープリンク（任意）
          </label>
          <input
            id="emergency-deeplink"
            style={inputStyle}
            value={deepLink}
            onChange={(e) => setDeepLink(e.target.value)}
            placeholder="jtour://..."
          />
        </div>

        <button
          type="submit"
          disabled={result.kind === 'loading'}
          style={{
            padding: '8px 18px',
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: '#c0392b',
            border: 'none',
            borderRadius: 4,
            cursor: result.kind === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {result.kind === 'loading' ? '発行中…' : '緊急通知を発行'}
        </button>
      </form>

      {result.kind === 'success' && (
        <div style={{ marginTop: 14, padding: 10, borderRadius: 4, background: '#eafbea', color: '#256029' }}>
          {result.message}
          {result.statusUpdates && Object.keys(result.statusUpdates).length > 0 && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              連動更新: {JSON.stringify(result.statusUpdates)}
            </div>
          )}
        </div>
      )}
      {result.kind === 'error' && (
        <div style={{ marginTop: 14, padding: 10, borderRadius: 4, background: '#fdecea', color: '#a1260d' }}>
          {result.message}
        </div>
      )}
    </div>
  )
}

export default EmergencyNoticeForm
