# Revisao visual de telas e campos

Data: 2026-06-11
Projeto: Sistema de Credito
Escopo: analise de telas, campos, formularios, filtros, tabelas, botoes e responsividade pelo codigo fonte.

## Veredito geral

Nao precisa refazer a interface inteira.

A base visual atual esta consistente: inputs, selects e textareas usam altura minima adequada, largura maxima, `min-width: 0`, bordas consistentes, foco visual, grid responsivo e quebra de texto. As tabelas usam `overflow-x-auto` e as telas principais possuem versao em cards mobile ou grid adaptavel.

O que ainda precisa de melhoria visual/UX nao e a aparencia basica dos campos, mas sim:

- telas com campos demais no mesmo bloco;
- filtros muito densos;
- tabelas exibindo JSON, UUID ou status tecnico;
- acoes perigosas muito expostas;
- `window.prompt` em fluxos importantes;
- campos que exigem texto separado por virgula quando deveriam ser controles visuais;
- upload de arquivo usando input nativo cru;
- campos `readOnly` que parecem editaveis.

Prioridade recomendada: ajustes pontuais em UX de formularios e tabelas, nao nova identidade visual.

## Base visual global

### Pode manter

- Inputs/selects/textareas padronizados em `src/styles.css`.
- Altura minima de 44px para campos comuns.
- Bordas, foco e contraste em bom nivel.
- `form-grid` com 2 colunas no desktop e 1 coluna no mobile.
- `filter-grid-desktop` quebrando para coluna unica no mobile.
- `desktop-table-wrap` com rolagem horizontal.
- Cards mobile com `overflow-wrap: anywhere`.
- Botoes com hover, active e disabled.
- Acoes compactas na tabela de equipe ja foram melhoradas.

### Ainda merece ajuste global

1. Criar um componente visual para input de arquivo.
   Hoje `input type="file"` aparece cru em Vendas, Pagamentos, Gastos e Configuracoes.

2. Criar chips/badges de status padronizados.
   Hoje varias tabelas mostram `active`, `paid_off`, `overdue`, `inflow`, `outflow`, etc. como texto tecnico.

3. Criar componente de campo somente leitura.
   Hoje alguns valores calculados aparecem dentro de input `readOnly`, parecendo editaveis.

4. Criar componente de filtros expansivel.
   Algumas telas possuem muitos filtros no mesmo painel.

5. Criar componente de confirmacao/modal.
   O sistema ainda usa `window.confirm` e `window.prompt` em fluxos importantes.

## Avaliacao por tela

| Tela | Precisa alterar visualmente? | Prioridade | Julgamento |
|---|---:|---:|---|
| Login | Nao urgente | Baixa | Visual adequado. Campos simples e claros. |
| Dashboard | Nao urgente | Baixa | Boa composicao, KPIs e estados. |
| Simulador | Pequeno ajuste | Baixa | Campos bons; resultado poderia destacar melhor valores principais. |
| Vendas | Sim | Alta | Formulario longo, muitos campos de cliente e venda no mesmo fluxo. |
| Detalhe da venda | Pequeno ajuste | Media | Tabelas ok, mas status e valores podem virar badges/resumos. |
| Clientes | Pequeno ajuste | Media | Cadastro compacto esta bom; filtros e tabela podem melhorar status/acoes. |
| Detalhe do cliente | Sim | Media | Muitas acoes no topo e varias tabelas; precisa hierarquia melhor. |
| Carteira | Sim | Media | Filtros densos e tabela sem card mobile dedicado. |
| Cobrancas | Sim | Alta | Muitos filtros e uso de prompts nativos para promessa/renegociacao. |
| Pagamentos | Sim | Alta | Fluxo tem muitos selects encadeados e campos calculados em inputs. |
| Recibos | Nao urgente | Baixa | Estrutura simples. |
| Rotas | Sim | Media | Campo de dias por virgula deve virar seletor visual. |
| Detalhe da rota | Pequeno ajuste | Baixa | Boa tela analitica; pode melhorar badges/status. |
| Afiliados/Cobradores | Pequeno ajuste | Media | Ja melhorou, mas acoes ainda poderiam virar menu/icone no desktop. |
| Movimentos | Pequeno ajuste | Media | Tipo/status tecnicos na tabela; filtros ok. |
| Caixas | Pequeno ajuste | Baixa | Formulario curto e claro. |
| Gastos | Pequeno ajuste | Media | Bom fluxo, mas upload cru e arquivamento visualmente poderia ser mais claro. |
| Relatorios | Sim | Alta | Tabela dinamica mostra nomes tecnicos/IDs e filtros sao densos. |
| Configuracoes | Sim | Alta | Campos por virgula e logo path sao pouco amigaveis. |
| Auditoria | Sim | Alta | Exibe UUID e JSON bruto, prejudicando legibilidade. |

## Telas que eu mudaria primeiro

### 1. Configuracoes

Arquivo: `src/pages/settings-page.tsx`

Problemas:

- `Dias permitidos` e campo texto com numeros separados por virgula.
- `Modalidades` e campo texto com numeros separados por virgula.
- `Formas de pagamento` e campo texto com codigos separados por virgula.
- `Logo path` e tecnico demais para usuario comum.
- Upload de logo usa input nativo.

Recomendacao:

- Trocar dias por checkboxes/chips: Seg, Ter, Qua, Qui, Sex, Sab, Dom.
- Trocar modalidades por chips/editavel numerico.
- Trocar formas de pagamento por checkboxes: Dinheiro, Pix, Transferencia, Outra.
- Mostrar preview do logo.
- Esconder `Logo path` em modo avancado ou renomear para `URL atual do logo`.

Status: precisa alterar.

### 2. Cobrancas

Arquivo: `src/pages/collections-page.tsx`

Problemas:

- Usa `window.prompt` para promessa e renegociacao.
- Filtros ocupam muito espaco: termo, rota, afiliado, cliente, status, de, ate.
- Renegociacao pede frequencia em texto tecnico (`daily`, `weekly`, etc.).

Recomendacao:

- Criar modal de promessa com campo data.
- Criar modal de renegociacao com select de modalidade, select de frequencia e data inicial.
- Separar filtros principais de filtros avancados.
- Transformar status em chips/badges.

Status: precisa alterar.

### 3. Pagamentos

Arquivo: `src/pages/payments-page.tsx`

Problemas:

- Cliente, emprestimo e parcela sao selects encadeados em um formulario grande.
- Valor original, multa e total atualizado aparecem como inputs `readOnly`, parecendo campos editaveis.
- Upload de comprovante e input nativo.
- Depois de selecionar parcela, a tela poderia virar um resumo de pagamento mais guiado.

Recomendacao:

- Manter os selects, mas criar card de resumo da parcela selecionada.
- Trocar campos read-only por cards pequenos de valor.
- Melhorar upload de comprovante com botao/area de arquivo.
- Destacar valor final a pagar.

Status: precisa alterar.

### 4. Vendas

Arquivo: `src/pages/sales-page.tsx`

Problemas:

- Novo cliente possui muitos campos no mesmo bloco.
- Dados da venda tambem ficam densos.
- Upload de foto/documentos aparece cru.
- Campo `Taxa` deveria indicar `%`.

Recomendacao:

- Agrupar dados do novo cliente em subgrupos: Identificacao, Contato, Endereco, Documentos.
- Transformar upload em componente visual.
- Destacar obrigatorios.
- Melhorar preview do financiamento como resumo fixo.

Status: precisa alterar.

### 5. Relatorios

Arquivo: `src/pages/reports-page.tsx`

Problemas:

- Colunas sao dinamicas e usam nomes tecnicos vindos do banco.
- IDs e campos crus aparecem na tabela.
- Filtros ficam todos juntos.

Recomendacao:

- Criar mapeamento de labels por tipo de relatorio.
- Formatar datas, moedas e status.
- Esconder IDs ou oferecer botao copiar.
- Separar filtro de periodo dos filtros de entidade.

Status: precisa alterar.

### 6. Auditoria

Arquivo: `src/pages/audit-page.tsx`

Problemas:

- Mostra UUID de usuario/registro.
- Mostra JSON bruto em `Antes` e `Depois`.
- Tabela pode ficar visualmente pesada e horizontal demais.

Recomendacao:

- Mostrar resumo da mudanca em vez de JSON completo.
- Colocar JSON em detalhe expansivel/modal.
- Resolver nome do usuario quando possivel.
- Criar badges para acao (`insert`, `update`, `delete`, `login`, etc.).

Status: precisa alterar.

## Telas com ajuste medio

### Clientes

Arquivo: `src/pages/clients-page.tsx`

O cadastro compacto esta bom. O problema esta mais na listagem:

- status aparece cru;
- acoes podem ficar repetitivas;
- tabela com muitas colunas no desktop.

Recomendacao: badges de status, coluna de acoes mais compacta, e talvez cards tambem para tablet.

### Detalhe do cliente

Arquivo: `src/pages/client-detail-page.tsx`

Problemas:

- Muitas acoes no topo: WhatsApp, Nova venda, Editar, Ativar/Desativar, Excluir.
- Varias tabelas abaixo podem pesar visualmente.

Recomendacao: agrupar acoes secundarias em menu e usar abas: Dados, Vendas, Parcelas, Documentos.

### Carteira

Arquivo: `src/pages/wallet-page.tsx`

Problemas:

- Tela depende muito de tabela com scroll.
- Nao tem lista em cards mobile dedicada como Clientes/Equipe.

Recomendacao: criar cards mobile para carteira e badges de status.

### Rotas

Arquivo: `src/pages/routes-page.tsx`

Problemas:

- `Dias adicionais de cobranca` e texto por virgula.
- Formulario mistura dados de local, meta, cobranca e status.

Recomendacao: chips de dias da semana e separar dados de cobranca visualmente.

### Afiliados/Cobradores

Arquivo: `src/pages/team-page.tsx`

O problema original de quebra do botao Excluir foi bem atacado por CSS (`team-members-table`, `compact-actions`). Ainda assim:

- tres botoes por linha na tabela deixam a coluna larga;
- status e papel poderiam ser badges.

Recomendacao: manter funcional, mas trocar acoes por menu ou icon buttons em uma fase de polimento.

## Telas que podem manter como estao

### Login

Campos simples e fluxo claro. Nao precisa alteracao visual agora.

### Dashboard

Boa hierarquia geral, KPIs, cards e loading. Melhorias futuras seriam mais de dados/performance do que campo visual.

### Simulador

Formulario claro e direto. Pode melhorar destaque do resultado, mas nao e critico.

### Caixas

Formulario curto e compreensivel. Pode manter.

### Recibos

Tela objetiva. Pode manter.

### Detalhe da rota

Boa tela de consulta. Ajuste opcional em badges e tabela.

## Riscos visuais ainda existentes

1. Tabelas com conteudo longo ainda podem ficar pesadas, mesmo com scroll horizontal.
2. Selects com nomes grandes de clientes/rotas/afiliados podem ficar longos visualmente.
3. Inputs de arquivo nativos destoam do acabamento premium.
4. JSON bruto em Auditoria prejudica sensacao profissional.
5. Campos por virgula em Configuracoes/Rotas parecem tecnico demais.
6. Prompts nativos em Cobrancas quebram a experiencia moderna.

## Prioridade de implementacao recomendada

### Alta

1. Cobrancas: substituir prompts por modais.
2. Configuracoes: trocar campos por virgula por controles visuais.
3. Pagamentos: criar resumo visual da parcela e melhorar upload.
4. Auditoria: esconder JSON bruto em detalhe expansivel.
5. Relatorios: labels humanas e formatacao de tabela.

### Media

1. Vendas: organizar novo cliente em subgrupos.
2. Cliente detalhe: usar abas e menu de acoes.
3. Carteira: criar cards mobile.
4. Rotas: chips de dias da semana.
5. Afiliados/Cobradores: badges e menu de acoes.

### Baixa

1. Simulador: melhorar destaque dos resultados.
2. Caixas: pequeno polimento em status.
3. Dashboard: manter.
4. Login: manter.

## Conclusao

O sistema nao tem um problema geral de campos estourando a tela hoje. O CSS atual ja protege bem contra overflow em formularios, tabelas e cards.

Minha recomendacao e nao mexer em tudo de uma vez. O ganho visual real vem de substituir campos tecnicos e densos por componentes mais humanos:

- chips;
- badges;
- modais;
- cards de resumo;
- upload customizado;
- abas;
- menus de acoes;
- tabelas com labels amigaveis.

Se for para iniciar a proxima rodada de UI, eu comecaria por Configuracoes, Cobrancas, Pagamentos, Auditoria e Relatorios.
