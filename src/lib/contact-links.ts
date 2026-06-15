export function createWhatsappUrl(phone: string | null | undefined, message?: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')

  if (!digits) {
    return null
  }

  const encodedMessage = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : ''
  return `https://wa.me/${digits}${encodedMessage}`
}
