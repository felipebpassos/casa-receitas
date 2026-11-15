# Receitas de Casa

App Android (React Native + Expo + Supabase) para **escolher as receitas da semana e saber o que comprar**.

## Abas

| Aba | O que faz |
| --- | --- |
| **Receitas** | **Meu caderno** (criadas por você + cópias salvas de outras pessoas) e **Explorar** (biblioteca pública, só receitas aprovadas). |
| **Semana** | Plano da semana (várias receitas por dia, qualquer semana) e botão **Gerar lista de compras**: abre a lista em tela cheia, agrupada por preparo, para riscar o que já tem, adicionar itens avulsos e compartilhar. |

## Como funciona

- **Login é opcional.** Sem conta, tudo fica salvo no celular. Ao entrar, tudo o que já estava no celular vai para a conta automaticamente.
- **Catálogo fechado de ingredientes.** As receitas só usam ingredientes do catálogo global (tabela `ingredients`). Não existe ingrediente personalizado. Quem não encontrar o que precisa pode **sugerir** um ingrediente (`ingredient_suggestions`), que passa por aprovação.
- **Subreceitas.** Uma receita pode usar outra como ingrediente: a lasanha usa a receita de molho bolonhesa. Funciona em qualquer nível, e o app impede ciclos.
- **Lista de compras agrupada por preparo.** Cada receita da semana e cada subpreparo vira um grupo com os seus ingredientes. Ingredientes de grupos diferentes **não são somados**: assim fica claro quanto de cada item vai em cada preparo.
  - Dentro de um grupo, o mesmo ingrediente com unidade compatível é somado (kg→g e l→ml são convertidos).
  - Receita planejada duas vezes, ou subpreparo usado por duas receitas, conta uma vez por uso.
- **Riscar.** Na lista de compras, toque no item para riscá-lo (já tenho / já peguei). Já tem um preparo pronto? Use **Riscar tudo** no grupo dele. Cada semana tem a sua lista, guardada só no celular; as de semanas passadas são apagadas.
- **Salvar receita de outra pessoa** cria uma **cópia** no seu caderno, com o crédito do autor. As subreceitas vêm junto. Cópias não podem ser enviadas para a biblioteca.
- **Biblioteca pública com moderação.** Ao marcar **Enviar para a biblioteca pública** (exige login), a receita e as subreceitas dela ficam **em análise** (`PENDING`). Você continua podendo usá-las na sua semana. Elas só aparecem em Explorar depois de **aprovadas** (`APPROVED`). Alterar uma receita aprovada a devolve para análise.
- **Origem da receita.** Cada receita guarda o link do vídeo ou da receita original e identifica a plataforma (YouTube, Instagram, TikTok, Facebook, Pinterest ou site).

## Moderação (painel do Supabase)

Status das receitas: `PRIVATE` → `PENDING` → `APPROVED` / `REJECTED`. Pelo app, ninguém consegue aprovar nada (um trigger no banco bloqueia). Pelo painel (Studio / Table Editor), você consegue.

- **Receitas:** em `recipes`, filtre `status = PENDING`.
  - Para aprovar, mude para `APPROVED`. As subreceitas são aprovadas junto.
  - Para recusar, mude para `REJECTED` e preencha `rejection_reason`. A pessoa vê o motivo no app.
  - `reviewed_at` é preenchido automaticamente.
- **Ingredientes sugeridos:** em `ingredient_suggestions`, filtre `status = PENDING`.
  1. Acrescente o ingrediente em [scripts/catalog-source.mjs](scripts/catalog-source.mjs) e rode `node scripts/build-catalog.mjs`. Isso gera o ID em `src/data/catalog.json` (o catálogo embutido, usado offline).
  2. Insira o ingrediente em `ingredients` **com esse mesmo ID** (`id`, `name`, `default_unit` e, se quiser limitar as unidades no formulário, `allowed_units`).
  3. Marque a sugestão como `APPROVED`.
  4. O app baixa o catálogo do servidor ao abrir, então o ingrediente aparece para todo mundo sem precisar de build nova.

## Configuração

Requer Node 20+ (o projeto tem `.nvmrc` com 22) e, para o banco local, Docker Desktop aberto.

### 1. Banco local (Docker)

O Supabase CLI roda Postgres, autenticação e API em containers. As migrations de `supabase/migrations/` são aplicadas automaticamente.

```bash
npm install
npm run db:start       # sobe o Supabase local (1ª vez baixa as imagens)
npm run db:status      # mostra URLs e chaves
```

No `.env`, use o **IP da sua máquina na rede**, não `127.0.0.1`, porque o celular precisa alcançá-lo:

```
EXPO_PUBLIC_SUPABASE_URL=http://SEU-IP:54321
EXPO_PUBLIC_SUPABASE_KEY=<PUBLISHABLE_KEY do db:status>
```

- **Studio** (ver tabelas e dados): <http://127.0.0.1:54323>
- No ambiente local, a confirmação de e-mail fica desligada: cadastrou, entrou.
- `npm run test:db` testa SQL, funções e regras de acesso contra o banco do `.env`. Ele cria usuários de teste, então **rode só no local**.
- `npm run db:reset` recria o banco do zero (apaga os dados). `npm run db:stop` desliga os containers.

### 2. App

```bash
npm start              # escaneie o QR code com o Expo Go no Android (mesma rede Wi-Fi)
```

### Login com Google (opcional)

O login abre o navegador, passa pelo Google e volta para o app (funciona no Expo Go, em builds e na web).

1. No [Google Cloud](https://console.cloud.google.com/), em **APIs e serviços → Credenciais**, crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**:
   - URI de redirecionamento autorizado: `http://127.0.0.1:54321/auth/v1/callback` (local) e, na nuvem, `https://<ref-do-projeto>.supabase.co/auth/v1/callback`.
   - Origem JavaScript autorizada (para a web): `http://localhost:8081`.
2. Coloque o Client ID e o secret no `.env` (veja `.env.example`), mude `enabled = true` em `[auth.external.google]` no `supabase/config.toml` e reinicie: `npm run db:stop && npm run db:start`.
3. O Google só aceita `http` em `localhost`, então o retorno passa por `127.0.0.1:54321`. No **emulador Android** (ou celular via USB), redirecione a porta antes de testar:
   ```bash
   adb reverse tcp:54321 tcp:54321
   ```
   No celular pelo Wi-Fi, sem USB, o login com Google só funciona com o Supabase na nuvem.

Os destinos de retorno do app (`receitasdecasa://**`, `exp://**`, `http://localhost:8081/**`) já estão liberados em `additional_redirect_urls`.

### 3. Subir para o Supabase na nuvem (depois)

1. Crie um projeto em <https://supabase.com> (plano gratuito).
2. Envie as mesmas migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
3. Em **Authentication → Sign In / Providers → Email**, decida se exige confirmação de e-mail. Para o Google, ative o provedor **Google** ali com o Client ID e o secret, e em **Authentication → URL Configuration** adicione `receitasdecasa://**` (e `exp://**` se for testar no Expo Go) às Redirect URLs.
4. Troque o `.env` pela URL e chave *publishable* do projeto (botão **Connect**).

Sem o `.env`, o app funciona só no modo local: receitas, semana e lista de compras funcionam; conta e biblioteca pública não.

APK instalável (EAS, plano gratuito): `npx eas-cli@latest build -p android --profile preview`

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm start` | Servidor de desenvolvimento |
| `npm run db:start` / `db:stop` / `db:status` / `db:reset` | Supabase local no Docker |
| `npm run test:db` | Testa banco, funções e RLS (só no local) |
| `npm test` | Testes da lista de compras (grupos por preparo, somas, ciclos) e validações |
| `npm run typecheck` | Checagem de tipos |
| `npx expo lint` | Lint |
| `node scripts/build-catalog.mjs` | Regenera o catálogo de ingredientes (app + seed SQL) a partir de [scripts/catalog-source.mjs](scripts/catalog-source.mjs) |

## Estrutura

```
src/
  app/                        rotas (Expo Router)
    (tabs)/index.tsx          Receitas
    (tabs)/semana.tsx         Semana
    recipe/[id].tsx           detalhes (da coleção ou da biblioteca pública)
    recipe/form.tsx           cadastro/edição
    account.tsx               entrar / criar conta / sair
  context/
    AuthProvider.tsx          sessão (opcional)
    DataProvider.tsx          estado do app + operações; escolhe celular ou conta
  lib/
    shopping.ts               regras puras: lista de compras por preparo, subreceitas, ciclos
    repo/localRepo.ts         dados no celular (AsyncStorage)
    repo/remoteRepo.ts        dados na conta (Supabase)
    repo/migrate.ts           celular → conta no primeiro login
    publicLibrary.ts          biblioteca pública
    catalog.ts                catálogo global (embutido + baixado do servidor) e sugestões
    source.ts                 link/plataforma de origem
  components/                 UI e seletores
supabase/migrations/          SQL do banco (tabelas, RLS, funções)
```

### Decisões técnicas

- **Catálogo embutido + atualizado.** O catálogo global vem dentro do app, com os mesmos IDs do banco, para o modo sem conta funcionar offline. Ao abrir, o app baixa o catálogo do servidor e guarda em cache, para que ingredientes aprovados depois apareçam sem build nova.
- **IDs gerados no app (UUID).** Os dados locais sobem para a conta com os mesmos IDs. A migração pode ser repetida sem duplicar nada.
- **Uma interface, duas implementações.** As telas usam só o `DataProvider`, que fala com uma interface `Repo` implementada pelo celular (`LocalRepo`) e pela conta (`RemoteRepo`).
- **Segurança (RLS + triggers).** Receitas privadas e o plano da semana só são acessíveis pelo dono. A lista de compras (riscos e itens avulsos) não vai para o banco: fica só no celular. Visitantes sem login só leem receitas `APPROVED`. Ingredientes são somente leitura para o app. O trigger `recipes_guard_status` impede que usuários aprovem receitas e devolve para análise qualquer alteração em receita aprovada. `save_recipe` grava receita e itens numa transação e envia as subreceitas para análise junto.
