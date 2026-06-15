import type { User } from '@supabase/supabase-js'

import type { Profile } from '../types/auth'

export function getUserDisplayName(profile: Profile | null, user: User | null): string {
  const profileRecord = toRecord(profile)
  const metadata = toRecord(user?.user_metadata)

  return firstNonEmpty([
    readString(profileRecord, 'full_name'),
    readString(profileRecord, 'name'),
    readString(metadata, 'full_name'),
    readString(metadata, 'name'),
    readNestedString(profileRecord, 'affiliate', 'name'),
    readNestedString(profileRecord, 'member', 'name'),
    readNestedString(metadata, 'affiliate', 'name'),
    readNestedString(metadata, 'member', 'name'),
    user?.email,
  ]) ?? 'Usuario'
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return null
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' ? value : null
}

function readNestedString(record: Record<string, unknown> | null, parentKey: string, key: string): string | null {
  return readString(toRecord(record?.[parentKey]), key)
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}
