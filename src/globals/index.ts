import type { GlobalConfig } from 'payload'

import { AppSettings } from './AppSettings'
import { LegalDocuments } from './LegalDocuments'

export const globals: GlobalConfig[] = [LegalDocuments, AppSettings]

export { AppSettings, LegalDocuments }
