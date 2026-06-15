import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceRoleKey) throw new Error('Supabase server credentials ausentes.')
    const authorization = request.headers.get('Authorization') ?? ''
    const admin = createClient(url, serviceRoleKey)
    const token = authorization.replace('Bearer ', '')
    const { data: caller, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !caller.user) throw new Error('Sessao invalida.')
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
    if (callerProfile?.role !== 'admin') throw new Error('Somente admin pode excluir usuarios.')

    const body = await request.json()
    const userId = String(body.userId ?? '')
    if (!userId) throw new Error('Usuario nao informado.')
    if (userId === caller.user.id) throw new Error('Voce nao pode excluir o usuario conectado.')

    const ownedRecords = await Promise.all([
      admin.from('routes').select('id').eq('owner_id', userId).limit(1),
      admin.from('clients').select('id').eq('owner_id', userId).limit(1),
      admin.from('loans').select('id').eq('owner_id', userId).limit(1),
      admin.from('payments').select('id').eq('owner_id', userId).limit(1),
      admin.from('cashboxes').select('id').eq('owner_id', userId).limit(1),
      admin.from('cash_movements').select('id').eq('owner_id', userId).limit(1),
      admin.from('expenses').select('id').eq('owner_id', userId).limit(1),
      admin.from('collection_logs').select('id').eq('owner_id', userId).limit(1),
    ])
    const lookupError = ownedRecords.find((result) => result.error)?.error
    if (lookupError) throw lookupError
    if (ownedRecords.some((result) => result.data?.length)) {
      throw new Error('Este usuario criou registros operacionais. Use Desativar para preservar o historico financeiro.')
    }

    const unlinkOperations = await Promise.all([
      admin.from('routes').update({ collector_id: null }).eq('collector_id', userId),
      admin.from('clients').update({ affiliate_id: null }).eq('affiliate_id', userId),
      admin.from('loans').update({ collector_id: null }).eq('collector_id', userId),
      admin.from('collection_logs').update({ collector_id: null }).eq('collector_id', userId),
      admin.from('expenses').update({ responsible_id: null }).eq('responsible_id', userId),
      admin.from('audit_logs').update({ actor_id: null }).eq('actor_id', userId),
      admin.from('client_documents').update({ uploaded_by: null }).eq('uploaded_by', userId),
    ])
    const unlinkError = unlinkOperations.find((result) => result.error)?.error
    if (unlinkError) throw unlinkError

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError && !isAuthUserNotFound(deleteError)) throw deleteError
    if (deleteError) {
      const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', userId)
      if (profileDeleteError) throw profileDeleteError
    }
    return new Response(JSON.stringify({ id: userId }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao excluir usuario.' }), { headers, status: 400 })
  }
})

function isAuthUserNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('user not found')
}
