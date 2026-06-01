export type AccessSettings = {
  id: string
  owner_id: string
  opening_time: string
  closing_time: string
  allowed_days: number[]
  timezone: string
  allow_admin_outside_hours: boolean
  created_at: string
  updated_at: string
}

export type AccessBlockDetails = {
  allowed: false
  currentTime: string
  openingTime: string
  closingTime: string
  nextAllowedAt: string
}
