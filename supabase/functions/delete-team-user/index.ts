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

    const links = await Promise.all([
      admin.from('routes').select('id').eq('collector_id', userId).limit(1),
      admin.from('clients').select('id').eq('affiliate_id', userId).limit(1),
      admin.from('loans').select('id').eq('collector_id', userId).limit(1),
      admin.from('collection_logs').select('id').eq('collector_id', userId).limit(1),
    ])
    const lookupError = links.find((result) => result.error)?.error
    if (lookupError) throw lookupError
    if (links.some((result) => result.data?.length)) {
      throw new Error('Este usuario possui vinculos operacionais. Use Desativar para preservar o historico.')
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError
    return new Response(JSON.stringify({ id: userId }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao excluir usuario.' }), { headers, status: 400 })
  }
})
