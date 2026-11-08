# Receitas de Casa

App Android (React Native + Expo + Supabase) para saber **o que cozinhar, o que já tem em casa e o que precisa comprar**.

## Abas

| Aba | O que faz |
| --- | --- |
| **Receitas** | **Minhas** (criadas por você), **Salvas** (cópias de receitas de outras pessoas) e **Explorar** (biblioteca pública). Ao abrir uma receita, aparece o que falta comprar para fazê-la. |
| **Despensa** | Checklist "tenho / não tenho" dos **ingredientes** e dos **preparos** (receitas usadas dentro de outras, ex.: molho bolonhesa). |
| **Semana** | Plano da semana (várias receitas por dia, qualquer semana), **o que comprar nesta semana** e itens avulsos. |

## Como funciona

- **Login é opcional.** Sem conta, tudo fica salvo no celular. Ao entrar, tudo o que já estava no celular vai para a conta automaticamente. O acesso à conta fica no ícone de perfil, no topo.
- **Subreceitas.** Uma receita pode usar outra como ingrediente: a lasanha usa a receita de molho bolonhesa.
  - Se você **tem o molho pronto** (marcado na Despensa), ele não entra nas compras.
  - Se **não tem**, entram os ingredientes das duas receitas, somados.
  - A receita do molho inteira conta uma vez para cada receita que a usa. Funciona em qualquer nível, e o app impede ciclos (uma receita que depende de si mesma).
- **O que comprar** = ingredientes das receitas (e subreceitas) menos o que você tem em casa. O mesmo ingrediente com unidade compatível é somado (kg→g e l→ml são convertidos).
- **Comprei.** Na Semana, marcar um item como comprado faz ele constar como "tenho" na Despensa, e ele sai da lista. Dá para desfazer.
- **Salvar receita de outra pessoa** cria uma **cópia** na sua coleção, com o crédito do autor. As subreceitas vêm junto. Você pode editar a cópia, mas não publicá-la.
- **Publicar** exige login. Ao publicar, as subreceitas usadas também ficam públicas.
- **Origem da receita.** Cada receita guarda o link do vídeo ou da receita original e identifica a plataforma (YouTube, Instagram, TikTok, Facebook, Pinterest ou site). É a base para a futura importação automática.

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

### 3. Subir para o Supabase na nuvem (depois)

1. Crie um projeto em <https://supabase.com> (plano gratuito).
2. Envie as mesmas migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
3. Em **Authentication → Sign In / Providers → Email**, decida se exige confirmação de e-mail.
4. Troque o `.env` pela URL e chave *publishable* do projeto (botão **Connect**).

Sem o `.env`, o app funciona só no modo local: receitas, despensa e semana funcionam; conta e biblioteca pública não.

APK instalável (EAS, plano gratuito): `npx eas-cli@latest build -p android --profile preview`

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm start` | Servidor de desenvolvimento |
| `npm run db:start` / `db:stop` / `db:status` / `db:reset` | Supabase local no Docker |
| `npm run test:db` | Testa banco, funções e RLS (só no local) |
| `npm test` | Testes do cálculo "o que comprar" (subreceitas, despensa, somas, ciclos) |
| `npm run typecheck` | Checagem de tipos |
| `npx expo lint` | Lint |
| `node scripts/build-catalog.mjs` | Regenera o catálogo de ingredientes (app + seed SQL) a partir de [scripts/catalog-source.mjs](scripts/catalog-source.mjs) |

## Estrutura

```
src/
  app/                        rotas (Expo Router)
    (tabs)/index.tsx          Receitas
    (tabs)/despensa.tsx       Despensa
    (tabs)/semana.tsx         Semana
    recipe/[id].tsx           detalhes (da coleção ou da biblioteca pública)
    recipe/form.tsx           cadastro/edição
    account.tsx               entrar / criar conta / sair
  context/
    AuthProvider.tsx          sessão (opcional)
    DataProvider.tsx          estado do app + operações; escolhe celular ou conta
  lib/
    shopping.ts               regras puras: o que comprar, subreceitas, ciclos
    repo/localRepo.ts         dados no celular (AsyncStorage)
    repo/remoteRepo.ts        dados na conta (Supabase)
    repo/migrate.ts           celular → conta no primeiro login
    publicLibrary.ts          biblioteca pública
    catalog.ts                catálogo global embutido (mesmos IDs do banco)
    source.ts                 link/plataforma de origem
  components/                 UI e seletores
supabase/migrations/          SQL do banco (tabelas, RLS, funções)
```

### Decisões técnicas

- **Catálogo embutido.** O catálogo global de ingredientes vem dentro do app, com os mesmos IDs do banco. Assim o modo sem conta funciona offline, e a migração para a conta não precisa converter IDs.
- **IDs gerados no app (UUID).** Os dados locais sobem para a conta com os mesmos IDs. A migração pode ser repetida sem duplicar nada.
- **Uma interface, duas implementações.** As telas usam só o `DataProvider`, que fala com uma interface `Repo` implementada pelo celular (`LocalRepo`) e pela conta (`RemoteRepo`).
- **Segurança (RLS).** Receitas privadas, despensa, semana e itens avulsos só são acessíveis pelo dono. Visitantes sem login só leem receitas públicas. `save_recipe` grava receita e itens numa transação e publica as subreceitas junto.
