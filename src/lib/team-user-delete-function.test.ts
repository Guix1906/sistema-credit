import { describe, expect, it } from 'vitest'

import source from '../../supabase/functions/delete-team-user/index.ts?raw'

describe('delete-team-user edge function', () => {
  it('desvincula afiliado/cobrador antes de excluir o usuario do auth', () => {
    expect(source).toContain("admin.from('routes').update({ collector_id: null }).eq('collector_id', userId)")
    expect(source).toContain("admin.from('clients').update({ affiliate_id: null }).eq('affiliate_id', userId)")
    expect(source).toContain("admin.from('loans').update({ collector_id: null }).eq('collector_id', userId)")
    expect(source).toContain("admin.from('collection_logs').update({ collector_id: null }).eq('collector_id', userId)")
    expect(source).toContain("admin.auth.admin.deleteUser(userId)")
  })

  it('nao bloqueia exclusao apenas por vinculos operacionais preservaveis', () => {
    expect(source).not.toContain('possui vinculos operacionais')
    expect(source).toContain('Este usuario criou registros operacionais')
  })

  it('remove o perfil quando o usuario do auth ja nao existe', () => {
    expect(source).toContain('isAuthUserNotFound(deleteError)')
    expect(source).toContain("admin.from('profiles').delete().eq('id', userId)")
    expect(source).toContain("error.message.toLowerCase().includes('user not found')")
  })
})
