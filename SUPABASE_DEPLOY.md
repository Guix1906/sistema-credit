# Publicacao Supabase

As migrations e a Edge Function foram publicadas no projeto remoto em 30/05/2026.

Para republicar alteracoes futuras:

```powershell
npx supabase login
npx supabase link --project-ref mtjvkrzzhvxkvkosvipj
npx supabase db push
npx supabase functions deploy create-team-user
```

Depois, valide o fluxo:

1. Entre como admin.
2. Cadastre rota, caixa e cobrador.
3. Simule R$ 200 em 20 dias: total R$ 240 e 20 parcelas de R$ 12.
4. Converta em venda.
5. Registre pagamento parcial e total.
6. Abra recibo.
7. Confirme saldo do caixa, carteira, alertas, relatorios e auditoria.
