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
    if (callerProfile?.role !== 'admin') throw new Error('Somente admin pode atualizar usuarios.')

    const body = await request.json()
    const fullName = String(body.fullName ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!body.userId) throw new Error('Usuario nao informado.')
    if (!fullName) throw new Error('Informe o nome do usuario.')
    if (!email) throw new Error('Informe o e-mail usado para entrar no sistema.')

    const { error: authError } = await admin.auth.admin.updateUserById(body.userId, {
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName },
    })
    if (authError) throw authError

    const { error: profileError } = await admin.from('profiles').update({
      full_name: fullName,
      email,
      phone: body.phone || null,
      cpf: body.cpf || null,
      role: body.role,
      route_id: body.routeId || null,
      commission_rate: Number(body.commissionRate || 0),
      is_active: body.isActive !== false,
    }).eq('id', body.userId)
    if (profileError) throw profileError

    const { error: clearRouteError } = await admin.from('routes').update({ collector_id: null }).eq('collector_id', body.userId).neq('id', body.routeId || '00000000-0000-0000-0000-000000000000')
    if (clearRouteError) throw clearRouteError
    if (body.routeId && ['afiliado', 'cobrador'].includes(body.role)) {
      const { error: routeError } = await admin.from('routes').update({ collector_id: body.userId }).eq('id', body.routeId)
      if (routeError) throw routeError
    }

    return new Response(JSON.stringify({ id: body.userId }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao atualizar usuario.' }), { headers, status: 400 })
  }
})
