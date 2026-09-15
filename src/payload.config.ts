import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { collections } from './collections'
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
  // Expo 開発サーバなどアプリ側オリジンからの利用を許可（T-01-5）
  cors: corsOrigins.length ? corsOrigins : '*',
  csrf: corsOrigins,
  upload: {
    limits: { fileSize: 50_000_000 },
  },
})
