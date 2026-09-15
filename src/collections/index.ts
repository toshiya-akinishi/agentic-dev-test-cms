import type { CollectionConfig } from 'payload'

import { AdCreatives } from './AdCreatives'
import { AdSlots } from './AdSlots'
import { AnalyticsEvents } from './AnalyticsEvents'
import { Courses } from './Courses'
import { DeviceTokens } from './DeviceTokens'
import { Faqs } from './Faqs'
import { Favorites } from './Favorites'
import { GlossaryTerms } from './GlossaryTerms'
import { GuestSessions } from './GuestSessions'
import { GuideArticles } from './GuideArticles'
import { HighlightReels } from './HighlightReels'
import { HoleStatistics } from './HoleStatistics'
import { Holes } from './Holes'
import { Inquiries } from './Inquiries'
import { Likes } from './Likes'
import { LiveStreams } from './LiveStreams'
import { Media } from './Media'
import { News } from './News'
import { NotificationSettings } from './NotificationSettings'
import { Notifications } from './Notifications'
import { OnboardingSlides } from './OnboardingSlides'
import { Pairings } from './Pairings'
import { PlayerPositions } from './PlayerPositions'
import { PlayerStories } from './PlayerStories'
import { Players } from './Players'
import { Playlists } from './Playlists'
import { Rankings } from './Rankings'
import { Rounds } from './Rounds'
import { Scores } from './Scores'
import { Seasons } from './Seasons'
import { Shots } from './Shots'
import { Sponsors } from './Sponsors'
import { TicketOrders } from './TicketOrders'
import { TicketTypes } from './TicketTypes'
import { Tournaments } from './Tournaments'
import { TransportInfos } from './TransportInfos'
import { Users } from './Users'
import { VenueFacilities } from './VenueFacilities'
import { Venues } from './Venues'
import { Videos } from './Videos'
import { WeatherForecasts } from './WeatherForecasts'

/**
 * 全コレクション（docs/02-data-model.md 準拠・計 41 コレクション）
 */
export const collections: CollectionConfig[] = [
  AdCreatives,
  AdSlots,
  AnalyticsEvents,
  Courses,
  DeviceTokens,
  Faqs,
  Favorites,
  GlossaryTerms,
  GuestSessions,
  GuideArticles,
  HighlightReels,
  HoleStatistics,
  Holes,
  Inquiries,
  Likes,
  LiveStreams,
  Media,
  News,
  NotificationSettings,
  Notifications,
  OnboardingSlides,
  Pairings,
  PlayerPositions,
  PlayerStories,
  Players,
  Playlists,
  Rankings,
  Rounds,
  Scores,
  Seasons,
  Shots,
  Sponsors,
  TicketOrders,
  TicketTypes,
  Tournaments,
  TransportInfos,
  Users,
  VenueFacilities,
  Venues,
  Videos,
  WeatherForecasts,
]
