import type { CSSProperties } from 'react'

/**
 * Theme-aware Recharts palette. Charts receive colors as JS props (not CSS
 * classes), so pages read the mode from useTheme() and pick from here
 * instead of hardcoding hexes. Light values are the previously hardcoded
 * set; dark brightens the series and gives tooltips a dark panel (Recharts'
 * default tooltip background is white).
 */
export interface ChartTheme {
  /** CartesianGrid stroke */
  grid: string
  /** XAxis/YAxis line stroke */
  axis: string
  /** Tick label fill (merge into the tick style prop) */
  tickFill: string
  tooltip: {
    contentStyle: CSSProperties
    itemStyle: CSSProperties
    labelStyle: CSSProperties
  }
  income: string
  expense: string
  brand: string
  donut: string[]
}

const light: ChartTheme = {
  grid: '#f1f5f9',
  axis: '#94a3b8',
  tickFill: '#666666',
  tooltip: {
    contentStyle: { borderRadius: 12, borderColor: '#e2e8f0', backgroundColor: '#ffffff', fontSize: 12 },
    itemStyle: { color: '#334155' },
    labelStyle: { color: '#64748b' },
  },
  income: '#10b981',
  expense: '#f43f5e',
  brand: '#00b386',
  donut: ['#00b386', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#64748b'],
}

const dark: ChartTheme = {
  grid: '#1e293b',
  axis: '#475569',
  tickFill: '#94a3b8',
  tooltip: {
    contentStyle: { borderRadius: 12, borderColor: '#1e293b', backgroundColor: '#0f172a', fontSize: 12 },
    itemStyle: { color: '#e2e8f0' },
    labelStyle: { color: '#94a3b8' },
  },
  income: '#00e09e',
  expense: '#fb7185',
  brand: '#00d09c',
  donut: ['#00d09c', '#38bdf8', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c', '#94a3b8'],
}

export function chartTheme(darkMode: boolean): ChartTheme {
  return darkMode ? dark : light
}
