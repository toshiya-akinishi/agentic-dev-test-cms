import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { collections } from './collections'
import { endpoints } from './endpoints'
import { globals } from './globals'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export default buildConfig({
  admin: {
    user: 'users',
    meta: {
      titleSuffix: ' - J-Tour CMS',
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections,
  globals,
  endpoints,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'dev-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./jtour.db',
    },
  }),
  sharp,
  // Expo 開発サーバなどアプリ側オリジンからの利用を許可（T-01-5）。
  // `headers` にアプリ側が全リクエストで送る独自ヘッダー（ゲスト識別用 X-Device-Id、
  // 補-6-1-1）を追加しないと、ブラウザの CORS プリフライトが拒否されアプリから
  // 到達できなくなる（curl 等プリフライトを経由しない検証では見えないため注意）。
  cors: {
    origins: corsOrigins.length ? corsOrigins : '*',
    headers: ['X-Device-Id'],
  },
  csrf: corsOrigins,
  upload: {
    limits: { fileSize: 50_000_000 },
  },
})
