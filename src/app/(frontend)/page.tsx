export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 40, lineHeight: 1.8 }}>
      <h1>J-Tour CMS</h1>
      <p>国内男子ゴルフツアー観戦者向けアプリのバックエンドです。</p>
      <ul>
        <li>
          <a href="/admin">管理画面 (/admin)</a>
        </li>
        <li>
          <a href="/api/tournaments">REST API (/api/*)</a>
        </li>
      </ul>
    </main>
  )
}
