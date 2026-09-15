import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * 天候予報（要求 1-24 / 補-1-24-1〜3）
 * 1 時間毎 × 72 時間（3 日先）を 1 レコード 1 時間で保持する。
 * データ源は外部気象 API ではなく CMS 投入のテストデータ（補-1-24-3）。
 */
export const WeatherForecasts: CollectionConfig = {
  slug: 'weather-forecasts',
  labels: { singular: '天候予報', plural: '天候予報' },
  admin: {
    group: '現地情報',
    useAsTitle: 'forecastFor',
    defaultColumns: [
      'tournament',
      'forecastFor',
      'condition',
      'temperature',
      'precipProbability',
      'windSpeed',
    ],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      required: true,
      index: true,
    },
    {
      name: 'observedAt',
      type: 'date',
      label: '観測・発表日時',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '補-1-24-3。この予報を取得（投入）した日時',
      },
    },
    {
      name: 'forecastFor',
      type: 'date',
      label: '予報対象日時',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '補-1-24-1。1 時間刻み × 72 時間（今日 / 明日 / 明後日タブ）',
      },
    },
    {
      name: 'condition',
      type: 'select',
      label: '天候',
      required: true,
      options: [
        { label: '晴れ', value: 'sunny' },
        { label: '晴れ時々曇り', value: 'partly_cloudy' },
        { label: '曇り', value: 'cloudy' },
        { label: '雨', value: 'rain' },
        { label: '大雨', value: 'heavy_rain' },
        { label: '雷', value: 'thunder' },
        { label: '雪', value: 'snow' },
        { label: '霧', value: 'fog' },
      ],
      admin: { description: '補-1-24-2。アプリ側で天候アイコンに変換して表示します' },
    },
    {
      name: 'temperature',
      type: 'number',
      label: '気温（℃）',
      admin: { description: '補-1-24-2', step: 0.1 },
    },
    {
      name: 'windSpeed',
      type: 'number',
      label: '風速（m/s）',
      min: 0,
      admin: { description: '補-1-24-2', step: 0.1 },
    },
    {
      name: 'windDirection',
      type: 'select',
      label: '風向',
      options: [
        { label: '北 (N)', value: 'N' },
        { label: '北東 (NE)', value: 'NE' },
        { label: '東 (E)', value: 'E' },
        { label: '南東 (SE)', value: 'SE' },
        { label: '南 (S)', value: 'S' },
        { label: '南西 (SW)', value: 'SW' },
        { label: '西 (W)', value: 'W' },
        { label: '北西 (NW)', value: 'NW' },
      ],
      admin: { description: '補-1-24-2。ゴルフ観戦では風が重要なため矢印アイコンで表現します' },
    },
    {
      name: 'precipProbability',
      type: 'number',
      label: '降水確率（%）',
      min: 0,
      max: 100,
      admin: { description: '補-1-24-2' },
    },
  ],
}

export default WeatherForecasts
