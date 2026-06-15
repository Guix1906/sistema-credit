import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  let createdUserId: string | null = null
  let admin: ReturnType<typeof createClient> | null = null
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceRoleKey) throw new Error('Supabase server credentials ausentes.')
    const authorization = request.headers.get('Authorization') ?? ''
    admin = createClient(url, serviceRoleKey)
    const token = authorization.replace('Bearer ', '')
    const { data: caller, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !caller.user) throw new Error('Sessao invalida.')
    const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
    if (profile?.role !== 'admin') throw new Error('Somente admin pode criar usuarios.')

    const body = await request.json()
    const fullName = String(body.fullName ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!fullName) throw new Error('Informe o nome do usuario.')
    if (!email) throw new Error('Informe o e-mail usado para entrar no sistema.')
    if (password.length < 6) throw new Error('A senha inicial deve ter pelo menos 6 caracteres.')
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName },
    })
    if (error) throw error
    createdUserId = data.user.id
    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      email,
      phone: body.phone || null,
      cpf: body.cpf || null,
      role: body.role,
      route_id: body.routeId || null,
      commission_rate: Number(body.commissionRate || 0),
      is_active: true,
    })
    if (profileError) throw profileError
    if (body.routeId && ['afiliado', 'cobrador'].includes(body.role)) {
      const { error: routeError } = await admin.from('routes').update({ collector_id: data.user.id }).eq('id', body.routeId)
      if (routeError) throw routeError
    }
    return new Response(JSON.stringify({ id: data.user.id }), { headers })
  } catch (error) {
    if (admin && createdUserId) await admin.auth.admin.deleteUser(createdUserId)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao criar usuario.' }), { headers, status: 400 })
  }
})
