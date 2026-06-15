import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'

const CLIENT_DOCUMENTS_BUCKET = 'client-documents'
const RECEIPTS_BUCKET = 'receipts'
const BRAND_ASSETS_BUCKET = 'brand-assets'

export async function uploadClientDocument(profile: Profile, input: {
  clientId: string
  file: File
  documentType: string
}): Promise<string> {
  const { data: client, error: clientError } = await supabase.from('clients').select('owner_id').eq('id', input.clientId).single()
  if (clientError) throw clientError
  const path = `${client.owner_id}/${input.clientId}/${Date.now()}-${sanitizeFileName(input.file.name)}`
  const { error: uploadError } = await supabase.storage.from(CLIENT_DOCUMENTS_BUCKET).upload(path, input.file, { upsert: false })
  if (uploadError) throw uploadError

  const { error: documentError } = await supabase.from('client_documents').insert({
    owner_id: client.owner_id,
    client_id: input.clientId,
    document_type: input.documentType,
    file_name: input.file.name,
    file_path: path,
    mime_type: input.file.type || null,
    file_size: input.file.size,
    uploaded_by: profile.id,
  })
  if (documentError) throw documentError
  return path
}

export async function uploadReceipt(profile: Profile, input: {
  file: File
  folder: 'payments' | 'expenses'
  recordId: string
}): Promise<string> {
  const ownerId = await resolveReceiptOwnerId(profile, input.folder, input.recordId)
  const path = `${ownerId}/${input.folder}/${input.recordId}/${Date.now()}-${sanitizeFileName(input.file.name)}`
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, input.file, { upsert: false })
  if (error) throw error
  return path
}

export async function createClientDocumentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(CLIENT_DOCUMENTS_BUCKET).createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

export async function uploadBrandLogo(profile: Profile, file: File): Promise<string> {
  const path = `${profile.id}/logo-${Date.now()}-${sanitizeFileName(file.name)}`
  const { error } = await supabase.storage.from(BRAND_ASSETS_BUCKET).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(BRAND_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'arquivo'
}

async function resolveReceiptOwnerId(profile: Profile, folder: 'payments' | 'expenses', recordId: string): Promise<string> {
  const table = folder === 'payments' ? 'payments' : 'expenses'
  const { data, error } = await supabase.from(table).select('owner_id').eq('id', recordId).single()
  if (error) throw error
  return String(data?.owner_id ?? profile.id)
}
