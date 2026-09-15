import React from 'react'

export const metadata = {
  title: 'J-Tour CMS',
  description: '国内男子ゴルフツアー観戦アプリのバックエンド',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
