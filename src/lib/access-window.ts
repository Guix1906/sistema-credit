import type { UserRole } from '../types/auth'

export type AccessWindowConfig = {
  openingTime: string
  closingTime: string
  allowedDays: number[]
  timezone: string
  allowAdminOutsideHours: boolean
}

export type AccessWindowDecision =
  | {
      allowed: true
      currentTime: string
      openingTime: string
      closingTime: string
      nextAllowedAt: null
    }
  | {
      allowed: false
      currentTime: string
      openingTime: string
      closingTime: string
      nextAllowedAt: string
    }

type ZonedParts = {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function evaluateAccessWindow(config: AccessWindowConfig, role: UserRole, now = new Date()): AccessWindowDecision {
  const parts = getZonedParts(now, config.timezone)
  const currentMinutes = parts.hour * 60 + parts.minute
  const openingMinutes = parseTimeToMinutes(config.openingTime)
  const closingMinutes = parseTimeToMinutes(config.closingTime)
  const dayAllowed = config.allowedDays.includes(parts.weekday)
  const timeAllowed = isTimeInsideWindow(currentMinutes, openingMinutes, closingMinutes)
  const adminAllowed = role === 'admin' && config.allowAdminOutsideHours
  const currentTime = formatZonedDateTime(parts)

  if (adminAllowed || (dayAllowed && timeAllowed)) {
    return {
      allowed: true,
      currentTime,
      openingTime: config.openingTime,
      closingTime: config.closingTime,
      nextAllowedAt: null,
    }
  }

  return {
    allowed: false,
    currentTime,
    openingTime: config.openingTime,
    closingTime: config.closingTime,
    nextAllowedAt: findNextAllowedAt(parts, config),
  }
}

function isTimeInsideWindow(currentMinutes: number, openingMinutes: number, closingMinutes: number): boolean {
  if (openingMinutes === closingMinutes) {
    return true
  }

  if (openingMinutes < closingMinutes) {
    return currentMinutes >= openingMinutes && currentMinutes < closingMinutes
  }

  return currentMinutes >= openingMinutes || currentMinutes < closingMinutes
}

function findNextAllowedAt(parts: ZonedParts, config: AccessWindowConfig): string {
  const openingMinutes = parseTimeToMinutes(config.openingTime)
  const currentMinutes = parts.hour * 60 + parts.minute

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = addCalendarDays(parts, offset)
    const isToday = offset === 0
    const candidateWeekday = (parts.weekday + offset) % 7

    if (!config.allowedDays.includes(candidateWeekday)) {
      continue
    }

    if (isToday && currentMinutes < openingMinutes) {
      return `${formatDate(candidate)} ${config.openingTime}`
    }

    if (!isToday) {
      return `${formatDate(candidate)} ${config.openingTime}`
    }
  }

  return `${formatDate(addCalendarDays(parts, 1))} ${config.openingTime}`
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function parseTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function addCalendarDays(parts: ZonedParts, days: number): Pick<ZonedParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function formatZonedDateTime(parts: ZonedParts): string {
  return `${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}`
}

function formatDate(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
