# Publicacao Supabase

As migrations e Edge Functions foram publicadas no projeto remoto.

Ultima publicacao validada:

- Data: 2026-06-11
- Projeto: `mtjvkrzzhvxkvkosvipj`
- Migration remota mais recente: `20260611173000_harden_release_readiness.sql`
- Edge Functions publicadas: `create-team-user`, `update-team-user`, `delete-team-user`

Para republicar alteracoes futuras:

```powershell
npx supabase login
npx supabase link --project-ref mtjvkrzzhvxkvkosvipj
npx supabase db push
npx supabase functions deploy create-team-user update-team-user delete-team-user --project-ref mtjvkrzzhvxkvkosvipj
```

Antes de rodar `db push`, confira se nao ha migrations destrutivas pendentes:

```powershell
npx supabase migration list --linked
rg "delete from public|truncate|drop table|drop schema" supabase/migrations -n
```

Depois, valide o fluxo:

1. Entre como admin.
2. Cadastre rota, caixa e cobrador.
3. Simule R$ 200 em 20 dias: total R$ 240 e 20 parcelas de R$ 12.
4. Converta em venda.
5. Registre pagamento parcial e total.
6. Abra recibo.
7. Confirme saldo do caixa, carteira, alertas, relatorios e auditoria.
