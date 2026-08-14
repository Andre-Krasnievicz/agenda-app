# Agenda — Fisioterapia

Agenda pessoal para uma fisioterapeuta autônoma: marcar sessões, controlar
pacotes de sessões contratados e anotar observações clínicas. Implementado
conforme [`plano-implementacao-agenda-fisio.md`](./plano-implementacao-agenda-fisio.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 + PostgreSQL ·
Tailwind v4 + shadcn/ui · Zod · React Hook Form · TanStack Query ·
date-fns / date-fns-tz · Vitest.

## Rodando localmente

Pré-requisitos: Node 20+, Docker (para o Postgres local).

```bash
npm install
docker compose up -d          # sobe o Postgres local (porta 5432)
cp .env.example .env          # ajuste se necessário
npm run db:migrate            # aplica as migrations
npm run db:seed               # popula com dados de exemplo
npm run dev                   # http://localhost:3000
```

`npm run test` roda a suíte Vitest (testes puros de `calendar-layout`/`time`
e testes de integração dos services contra o Postgres local — precisa do
`docker compose up -d` rodando).

## Estrutura

Ver a seção 2 do plano de implementação. Resumo: `src/app/api/**` são cascas
finas que validam com Zod e chamam `src/server/services/**`, onde vive toda
a regra de negócio. `src/lib/time.ts` é o único lugar que converte fuso
horário (`America/Cuiaba`).

## Deploy em produção

O app está pronto para deploy na **Vercel** com banco **Neon** (ou Supabase).
Como não tenho acesso às suas contas, os passos abaixo ficam para você (ou
para me passar as credenciais e eu continuo):

1. **Banco de dados (Neon)**
   - Crie um projeto em [neon.tech](https://neon.tech).
   - Copie a *connection string* (formato `postgresql://...`).
   - **Confirme que o backup automático (point-in-time recovery) do Neon
     está ativo** — é gratuito no plano free e é a rede de segurança real
     dos dados dela, além do botão "Baixar meus dados" do app.
   - Rode as migrations contra o banco de produção:
     ```bash
     DATABASE_URL="<connection-string-do-neon>" npx prisma migrate deploy
     ```

2. **Deploy (Vercel)**
   - Conecte este repositório em [vercel.com/new](https://vercel.com/new).
   - Configure as variáveis de ambiente do projeto na Vercel:
     - `DATABASE_URL` — a connection string do Neon.
     - `ACCESS_KEY` — uma senha à sua escolha (ver proteção de acesso abaixo).
   - `TZ` não precisa ser configurada na Vercel: a Vercel já roda em UTC por
     padrão (ver armadilha 7 do plano).
   - Deploy.

3. **Proteção de acesso (seção 11.1 do plano — não pule)**
   O MVP ainda não tem login, mas guarda nome, telefone e observações
   clínicas de pacientes reais. Este repo já vem com a opção B do plano
   pronta: um `middleware.ts` que exige um cookie de acesso.
   - Defina `ACCESS_KEY` (um valor difícil de adivinhar) nas env vars da Vercel.
   - Acesse `https://seu-app.vercel.app/entrar?k=<ACCESS_KEY>` uma vez — isso
     grava um cookie de 1 ano — e só compartilhe esse link com ela.
   - Alternativa mais forte: ative também o **Vercel Deployment Protection**
     (Project Settings → Deployment Protection) direto no painel da Vercel.

4. **Depois do deploy**
   - Rode o seed de exemplo só se quiser dados de demonstração —
     **não rode `npm run db:seed` contra o banco de produção depois que ela
     começar a usar de verdade**: o seed apaga tudo antes de recriar.
   - Teste pelo celular e pelo notebook uma semana inteira de agenda real
     (critério de aceite da Fase 7).

## Backup manual

`GET /api/export` (botão "Baixar meus dados" em `/pacientes`) devolve um
JSON com todos os pacientes, pacotes e agendamentos — a rede de segurança
enquanto o app não tem autenticação de verdade.
