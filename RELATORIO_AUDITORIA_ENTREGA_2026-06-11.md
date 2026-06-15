# Relatorio de auditoria para entrega ao cliente

Data: 2026-06-11
Projeto auditado: Sistema de Credito
Stack: React 19, Vite 6, TypeScript, React Router, Supabase, Edge Functions, Vitest

## 1. Conclusao executiva

Status recomendado: NAO liberar para cliente final ainda.

O sistema esta bem estruturado para um produto de credito, com rotas protegidas, componentes reutilizaveis, servicos de dominio, RLS no Supabase, funcoes RPC para operacoes financeiras e Edge Functions para administracao de usuarios. O build de producao passa e os testes automatizados existentes passam.

Atualizacao apos correcoes desta rodada:

- As telas de clientes passaram a chamar `delete_or_archive_client` em vez de `purge_client_permanently`.
- Clientes com historico financeiro agora sao arquivados pela tela, preservando o historico.
- A leitura de `access_settings` nao usa mais fallback global por `updated_at`.
- A leitura de `app_settings` no layout passou a filtrar explicitamente por `owner_id`.
- Foi adicionada e publicada a migration `20260611173000_harden_release_readiness.sql`.
- As Edge Functions `create-team-user`, `update-team-user` e `delete-team-user` foram publicadas no Supabase remoto.
- O frontend passou a usar RPCs efetivos para configuracoes: `get_current_app_settings`, `get_current_access_settings` e `get_current_loan_settings`.
- Uploads de documentos/recibos passaram a usar o `owner_id` da operacao no caminho de Storage.
- Papeis legados (`manager`, `collector`, `operator`) foram normalizados para os papeis oficiais em portugues.

Mesmo assim, a entrega ainda tem riscos importantes:

- Algumas configuracoes sao globais/compartilhadas ou dependem demais de RLS, sem filtro explicito no frontend.
- Nao existe entidade de empresa/tenant (`company_id`); a arquitetura usa `owner_id`, perfil, rota e papeis.
- Edge Functions de equipe precisam estar publicadas no Supabase para refletir as correcoes locais.
- Nao ha testes E2E reais autenticados cobrindo criar, editar, excluir e salvar em banco.
- Nao ha script de lint no `package.json`.

Estimativa de prontidao: 90%.

Pode ser usado em ambiente interno/homologacao. Para cliente final, recomendo corrigir os bloqueadores e executar uma bateria E2E com banco sandbox.

## 2. Escopo solicitado x sistema real

O texto colado pede auditoria ampla antes de entrega e cita modulos juridicos em alguns pontos. O projeto encontrado nao e um sistema juridico. Ele e um sistema financeiro de credito/recebiveis com os seguintes modulos reais:

- Dashboard
- Simulador
- Vendas
- Detalhe da venda
- Clientes
- Detalhe do cliente
- Carteira
- Cobrancas
- Pagamentos
- Recibos
- Rotas
- Detalhe da rota
- Afiliados/Cobradores
- Movimentos de caixa
- Caixas
- Gastos
- Relatorios
- Configuracoes
- Auditoria

Modulos como triagem juridica, processos, prazos processuais, agenda juridica e documentos juridicos nao existem neste codigo e devem ser tratados como fora de escopo ou como novo backlog.

## 3. Validacoes executadas

Comandos executados:

```bash
npm run build
npm test -- --run
```

Resultado:

- Build de producao: passou.
- Vitest: passou, 10 arquivos e 20 testes.
- Servidor local: `http://127.0.0.1:5173/` respondeu HTTP 200.

Limitacao da validacao:

- Nao foi feito teste CRUD real contra Supabase autenticado porque nao havia credenciais de teste, usuario seedado e banco sandbox isolado para escrita destrutiva.
- A auditoria de CRUD foi feita por leitura estatica do codigo, migrations, RPCs e Edge Functions.

## 4. Arquitetura e fluxo de dados

### Frontend

O app usa Vite + React + TypeScript. A entrada principal carrega `src/app.tsx`, onde as rotas sao declaradas com `React.lazy` e `Suspense`. A maior parte das paginas fica dentro de `ProtectedRoute` e `AppLayout`.

`src/components/app-layout.tsx` monta o layout autenticado: menu lateral, topo, busca global por clientes, notificacoes, menu do perfil e navegacao mobile. Ele tambem busca alertas abertos e configuracao visual do sistema no Supabase.

`src/config/navigation.ts` centraliza o menu por grupo e por perfil de acesso. Isso controla quais itens aparecem para `admin`, `gerente`, `manager`, `afiliado`, `cobrador`, `collector` e outros papeis legados.

### Autenticacao

`src/contexts/auth-context.tsx` controla sessao Supabase, login, cadastro, recuperacao de senha, logout, perfil atual, auditoria de login/logout e bloqueio por horario. Ele usa `ensureCurrentProfile` para garantir que todo usuario autenticado tenha registro em `profiles`.

`src/components/protected-route.tsx` bloqueia rotas privadas quando nao ha sessao.

### Servicos de dominio

`src/services/finance-service.ts` e o principal servico de negocio. Ele centraliza:

- busca de opcoes para selects;
- cadastro e listagem de clientes;
- criacao de venda;
- listagem de carteira;
- fila de parcelas para cobranca;
- registro de pagamentos;
- movimentos de caixa;
- contatos de cobranca;
- renegociacao;
- metricas basicas;
- auditoria.

`src/services/dashboard-service.ts` calcula indicadores do dashboard a partir de loans, installments, payments, alerts e clients.

`src/services/storage-service.ts` encapsula uploads de documentos, recibos e logo.

`src/services/access-settings-service.ts` busca regras de horario de acesso.

### Banco e Supabase

As migrations criam tabelas principais:

- `profiles`
- `routes`
- `clients`
- `loan_settings`
- `loans`
- `installments`
- `cashboxes`
- `payments`
- `cash_movements`
- `expenses`
- `collection_logs`
- `alerts`
- `audit_logs`
- `client_documents`
- `access_settings`
- `app_settings`

O banco usa RLS em tabelas principais. A regra mais importante e `can_access_route(target_route_id)`, usada para permitir que usuarios vejam dados da rota propria ou de rotas onde sao cobradores/afiliados. Gerentes e admins usam `can_manage_all()`.

Operacoes financeiras criticas usam RPCs:

- `create_credit_sale`
- `register_installment_payment`
- `refresh_overdue_alerts`
- `renegotiate_loan`
- `create_manual_cash_movement`
- `reverse_cash_movement`
- `create_expense_with_cash_movement`
- `update_expense_details`
- `archive_expense`
- `delete_empty_route`
- `delete_or_archive_client`
- `purge_client_permanently`

Equipe usa Edge Functions:

- `create-team-user`
- `update-team-user`
- `delete-team-user`

## 5. Checklist por modulo

| Modulo | Status | Observacoes |
|---|---:|---|
| Login/Auth | Parcialmente pronto | Sessao, perfil, bloqueio por horario e auditoria existem. Falta E2E autenticado e limpeza de `console.error` de producao. |
| Dashboard | Parcialmente pronto | Usa dados reais e estados de loading/erro. Computa muito no cliente e limita consultas a 1000 linhas. |
| Simulador | Pronto para homologacao | Logica isolada e testada por unit tests do calculador. |
| Vendas | Parcialmente pronto | Usa RPC transacional quando disponivel; fallback existe, mas operacao financeira deve depender de RPC em producao. |
| Detalhe de venda | Pronto para homologacao | Consulta venda, parcelas e pagamentos; depende de RLS correto. |
| Clientes | Requer correcao | Criar/listar/editar existem. Excluir chama `purge_client_permanently`, com risco financeiro alto. |
| Detalhe do cliente | Requer correcao | Editar/desativar funcionam por codigo. Excluir tambem usa purge permanente. |
| Carteira | Parcialmente pronto | Filtros e metricas existem. Consultas com carga cliente-side podem sofrer em base grande. |
| Cobrancas | Parcialmente pronto | Filas, contato, promessa, WhatsApp e renegociacao existem. Usa prompts nativos, que sao fracos para UX e validacao. |
| Pagamentos | Parcialmente pronto | Usa RPC para pagamento e caixa. Precisa E2E real com recibo/upload/caixa. |
| Recibos | Pronto para homologacao | Le pagamento, cliente, venda e parcela. Depende da existencia dos registros. |
| Rotas | Parcialmente pronto | Criar, editar, arquivar e excluir vazia existem. Ha fallback para schema legado, indicando banco pode estar desalinhado. |
| Detalhe da rota | Pronto para homologacao | Mostra carteira, vendas, afiliado e historico. |
| Afiliados/Cobradores | Parcialmente pronto | Criar/editar/excluir/desativar existem via Edge Function. Precisa deploy das funcoes e teste real no Supabase. |
| Caixas | Parcialmente pronto | Criar/fechar existe. Nao ha exclusao; fechamento nao valida saldo final ou fechamento duplicado no cliente. |
| Movimentos | Parcialmente pronto | RPC para movimento manual e estorno existe. Precisa E2E com saldo. |
| Gastos | Parcialmente pronto | Criar/editar/arquivar com estorno existe. Precisa E2E com upload de comprovante e caixa. |
| Relatorios | Parcialmente pronto | Filtros, CSV e print existem. Limite 500 e agregacoes no cliente reduzem confianca para producao. |
| Configuracoes | Requer ajuste | Salva taxas, horario, app settings. Leitura/compartilhamento entre equipe esta inconsistente. |
| Auditoria | Parcialmente pronto | Registra eventos principais. Falta padrao consistente de auditoria para todas as mutacoes e sem PII desnecessaria. |

## 6. Bugs e riscos encontrados

### BUG-001 - Corrigido no frontend - Exclusao permanente de cliente remove dados financeiros

Arquivos:

- `src/pages/clients-page.tsx`
- `src/pages/client-detail-page.tsx`
- `supabase/migrations/20260601144500_purge_clients_permanently.sql`
- `supabase/migrations/20260601150000_allow_managers_to_purge_clients.sql`

As telas de clientes chamavam `purge_client_permanently`. Essa RPC remove payments, loans e clients. Movimentos de caixa e saldo podem permanecer sem a relacao original com pagamento/venda. Isso cria divergencia entre caixa, relatorios de vendas/pagamentos e historico do cliente.

Correcao aplicada:

- `src/pages/clients-page.tsx` agora chama `delete_or_archive_client`.
- `src/pages/client-detail-page.tsx` agora chama `delete_or_archive_client`.
- A mensagem de confirmacao informa que clientes com historico financeiro serao arquivados.
- Quando a RPC retorna `mode = archived`, a tela informa que o historico financeiro foi preservado.

Impacto:

- Historico financeiro pode ficar inconsistente.
- Relatorios podem mudar depois de uma exclusao.
- Auditoria fica incompleta para reconstituir a operacao.

Recomendacao restante:

- Manter purge permanente apenas para ambiente admin/suporte e, de preferencia, bloquear se houver historico financeiro.
- Se purge for realmente necessario, criar uma rotina explicita que tambem trate movimentos, recibos, documentos e saldos de forma auditada.

### BUG-002 - Parcialmente corrigido - `access_settings` e compartilhado globalmente

Arquivos:

- `src/services/access-settings-service.ts`
- `supabase/migrations/20260531133000_share_access_settings.sql`

A policy `Team can read access settings` permite `using (true)`. O servico buscava primeiro por `owner_id`, mas se nao encontrava, pegava a configuracao mais recente globalmente.

Correcao aplicada:

- `src/services/access-settings-service.ts` nao busca mais a configuracao global mais recente.
- Agora retorna apenas a configuracao do `owner_id` informado ou `null`.

Impacto:

- Uma configuracao de horario de outro dono/admin pode ser aplicada a usuarios sem configuracao propria.
- Em ambiente com mais de uma operacao, isso vira risco de isolamento.

Recomendacao restante:

- Definir uma entidade real de organizacao/empresa ou um admin-owner unico da operacao.
- Buscar configuracao por contexto permitido e documentado.

### BUG-003 - Alto - Nao existe `company_id`/tenant real

Arquivos:

- `supabase/migrations/20260529183000_create_credit_receivables_schema.sql`
- `supabase/migrations/20260529220000_expand_role_route_rls.sql`
- `src/services/finance-service.ts`

O banco usa `owner_id`, `route_id`, perfil e RLS por rota. Isso atende uma operacao unica com equipe e rotas. Nao atende multiempresa/tenant de forma explicita.

Impacto:

- Se o cliente espera varias empresas independentes, o modelo atual nao garante isolamento empresarial por tenant.
- Configuracoes, taxas, marca, horarios e relatorios ficam ambiguos.

Recomendacao:

- Se for produto multiempresa, criar `companies/workspaces`, `company_members` e `company_id` nas entidades operacionais.
- Se for instancia unica, documentar que o sistema e single-tenant por projeto Supabase.

### BUG-004 - Parcialmente corrigido - `app_settings` nao e compartilhado com equipe

Arquivos:

- `src/components/app-layout.tsx`
- `src/pages/settings-page.tsx`
- `supabase/migrations/20260530083500_ensure_app_settings_security.sql`

Configuracoes do sistema sao salvas por `owner_id = profile.id`. A policy de leitura permite apenas `owner_id = auth.uid()`. Logo, usuarios de equipe podem nao ver nome/logo configurados pelo admin.

Correcao aplicada:

- `src/components/app-layout.tsx` passou a filtrar `app_settings` explicitamente por `owner_id`.
- Isso remove dependencia implicita de RLS/maybeSingle sem filtro, mas ainda nao resolve compartilhamento de marca para toda a equipe.

Impacto:

- Marca/sistema pode aparecer inconsistente para afiliados/cobradores.
- `maybeSingle()` no layout sem filtro explicito depende totalmente do que o RLS retornar.

Recomendacao:

- Compartilhar app settings por organizacao/operacao.
- Enquanto nao houver company, criar RPC `get_current_app_settings()` que resolva a configuracao correta.

### BUG-005 - Corrigido - Edge Functions precisam ser publicadas

Arquivos:

- `supabase/functions/create-team-user/index.ts`
- `supabase/functions/update-team-user/index.ts`
- `supabase/functions/delete-team-user/index.ts`
- `src/pages/team-page.tsx`

A tela de Afiliados/Cobradores usa `supabase.functions.invoke`. Correcoes locais de exclusao/edicao so funcionam em producao depois do deploy das Edge Functions.

Correcao aplicada:

- Funcoes `create-team-user`, `update-team-user` e `delete-team-user` publicadas no projeto remoto `mtjvkrzzhvxkvkosvipj` em 2026-06-11.

Impacto:

- Excluir afiliado/cobrador pode continuar falhando no ambiente real.
- Edicao de email/nome pode ficar divergente entre `auth.users` e `profiles`.

Recomendacao restante:

- Validar com usuario admin real em banco sandbox.

### BUG-006 - Medio/Alto - Fallbacks indicam schema Supabase possivelmente desalinhado

Arquivos:

- `src/pages/routes-page.tsx`
- `src/services/finance-service.ts`

Ha fallback para rotas sem colunas novas (`main_collection_day`, `observations`) e fallback cliente-side para venda/pagamento caso RPC esteja ausente.

Impacto:

- Em producao, diferentes ambientes podem comportar-se de forma diferente.
- Operacoes financeiras perdem transacionalidade quando fallback e usado.

Recomendacao:

- Antes de entrega, aplicar todas as migrations.
- Remover ou desabilitar fallback financeiro em producao.
- Criar checklist de versionamento do banco.

### BUG-007 - Medio - Taxas ativas sao compartilhadas globalmente

Arquivos:

- `src/services/finance-service.ts`
- `supabase/migrations/20260531125500_share_active_loan_settings.sql`

`getActiveLoanSettings()` busca o ultimo `loan_settings` ativo sem filtro por operacao. A policy permite ler qualquer setting ativo.

Impacto:

- Uma taxa ativa pode ser usada por usuarios de outra operacao, se o banco tiver multiplos donos.

Recomendacao:

- Resolver por company/operacao.
- No minimo, criar regra clara de qual perfil administra a taxa oficial.

### BUG-008 - Medio - Relatorios e dashboard escalam mal

Arquivos:

- `src/services/dashboard-service.ts`
- `src/pages/reports-page.tsx`
- `src/services/finance-service.ts`

O dashboard busca ate 1000 registros e calcula indicadores no cliente. Relatorios limitam 500 linhas e tambem enriquecem/agregam no frontend.

Impacto:

- Em base grande, numeros podem ficar incompletos.
- Performance cai e o usuario pode confiar em relatorio parcial.

Recomendacao:

- Criar views/RPCs agregadas no Supabase.
- Exibir aviso de limite enquanto nao houver paginacao completa.

### BUG-009 - Medio - Papeis legados inconsistentes

Arquivos:

- `src/types/auth.ts`
- `src/config/navigation.ts`
- `supabase/migrations/20260529183000_create_credit_receivables_schema.sql`

Frontend e policies citam `manager`, `collector`, `operator`, mas a constraint inicial do banco aceita apenas `admin`, `gerente`, `afiliado`, `cobrador`, `atendente`.

Impacto:

- Futuras alteracoes podem falhar silenciosamente ou gerar erro de constraint.
- Codigo de permissao fica mais dificil de auditar.

Recomendacao:

- Decidir se roles legadas continuam.
- Se continuam, criar migration alterando constraint.
- Se nao continuam, remover roles legadas do frontend e policies.

### BUG-010 - Medio - Storage usa pasta por usuario, nao por dono do registro

Arquivos:

- `src/services/storage-service.ts`
- `supabase/migrations/20260529213000_create_storage_buckets.sql`

Uploads usam caminhos iniciados por `profile.id`. Para documentos de cliente, o metadado grava `owner_id` do cliente, mas o arquivo fica na pasta do usuario que fez upload.

Impacto:

- Outro membro com acesso ao cliente pode ver metadados pelo RLS, mas o signed URL pode falhar se as policies de storage so permitirem pasta do proprio usuario.

Recomendacao:

- Padronizar storage por `owner_id`/company e criar RPC/Edge Function para signed URL autorizado por cliente/rota.

### BUG-011 - Medio - Ausencia de E2E de CRUD

Nao ha testes automatizados de navegador cobrindo:

- criar/editar/excluir cliente;
- criar venda com parcelas;
- registrar pagamento com caixa;
- excluir/desativar afiliado;
- arquivar gasto com estorno;
- filtros de carteira/relatorios.

Impacto:

- Build e unit tests passam, mas fluxo real pode falhar em Supabase.

Recomendacao:

- Adicionar Playwright/Cypress contra banco sandbox seedado.

### BUG-012 - Baixo/Medio - Sem script de lint

`package.json` tem `dev`, `build`, `preview` e `test`, mas nao ha `lint`.

Impacto:

- Erros de qualidade e padrao podem passar.

Recomendacao:

- Adicionar ESLint/TypeScript lint no pipeline.

## 7. Checklist CRUD por entidade principal

| Entidade | Criar | Editar | Excluir/Arquivar | Observacao |
|---|---:|---:|---:|---|
| Usuario/equipe | Sim | Sim | Sim/parcial | Depende de Edge Functions publicadas. |
| Cliente | Sim | Sim | Risco alto | `purge_client_permanently` deve ser trocado por archive seguro. |
| Rota | Sim | Sim | Sim/parcial | Exclui apenas quando sem historico financeiro; arquiva caso necessario. |
| Venda | Sim | Nao pleno | Nao | Criacao existe. Cancelamento/edicao de venda nao aparece como fluxo completo. |
| Parcela | Via venda/RPC | Via pagamento | Nao direto | Operacao principal e pagamento/renegociacao. |
| Pagamento | Sim | Recibo apos registro | Nao/estorno indireto | Nao ha fluxo claro de cancelar pagamento. |
| Caixa | Sim | Fechar | Nao | Criacao e fechamento; sem edicao/exclusao. |
| Movimento | Sim | Nao | Estorno | Estorno via RPC. |
| Gasto | Sim | Sim parcial | Arquivar | Arquivamento estorna caixa. |
| Configuracao financeira | Sim/upsert | Sim | Nao | Compartilhamento precisa ajuste. |
| Auditoria | Auto | Nao | Nao | Correto preservar logs. |

## 8. Plano de correcao recomendado

### Fase 1 - Bloqueadores antes do cliente

1. Trocar exclusao de cliente para `delete_or_archive_client`.
2. Bloquear purge permanente quando houver venda, pagamento, documento, cobranca ou alerta.
3. Resolver compartilhamento de `app_settings`, `access_settings` e `loan_settings`.
4. Publicar todas as migrations no Supabase de destino.
5. Publicar Edge Functions `create-team-user`, `update-team-user`, `delete-team-user`.
6. Rodar teste manual/E2E autenticado com admin, gerente e cobrador.

### Fase 2 - Confianca operacional

1. Criar seed de homologacao.
2. Criar E2E: cliente -> venda -> pagamento -> recibo -> caixa -> relatorio.
3. Adicionar lint.
4. Criar RPCs de dashboard/relatorios agregados.
5. Padronizar storage por dono/empresa.

### Fase 3 - Produto escalavel

1. Decidir se o sistema e single-tenant ou multiempresa.
2. Se multiempresa, criar `company_id` e migrar modelo.
3. Criar permissao por papel em tabela, evitando roles hardcoded.
4. Criar tela de administracao de usuarios com reassociacao de carteira antes de exclusao.

## 9. Patch sugerido de maior impacto

Alterar as telas para usar arquivamento seguro:

```ts
const { data, error } = await supabase.rpc('delete_or_archive_client', { p_client_id: id })
```

E ajustar a mensagem:

```ts
const result = data as { mode?: string } | null
setMessage(result?.mode === 'archived'
  ? 'Cliente arquivado. O historico financeiro foi preservado.'
  : 'Cliente excluido.')
```

Depois disso, manter `purge_client_permanently` somente para uma area administrativa bem protegida, ou alterar a propria RPC para rejeitar clientes com qualquer historico financeiro.

## 10. Veredito final

O sistema tem uma base boa e bastante coisa ja esta implementada. Ele nao parece um prototipo vazio: ha regras de negocio reais, RLS, RPCs, storage, auditoria e tela para os principais fluxos.

Mas para entrega profissional ao cliente, eu nao aprovaria ainda sem corrigir os riscos financeiros e de isolamento de configuracao. A prioridade numero um e impedir que uma exclusao apague vendas/pagamentos e deixe caixa/relatorios divergentes. Em seguida, e preciso garantir que banco, migrations e Edge Functions estejam alinhados com o codigo local.
