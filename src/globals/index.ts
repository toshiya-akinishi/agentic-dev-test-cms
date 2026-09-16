import type { GlobalConfig } from 'payload'

import { AppSettings } from './AppSettings'
import { EmergencyBroadcast } from './EmergencyBroadcast'
import { LegalDocuments } from './LegalDocuments'

export const globals: GlobalConfig[] = [LegalDocuments, AppSettings, EmergencyBroadcast]

export { AppSettings, EmergencyBroadcast, LegalDocuments }
