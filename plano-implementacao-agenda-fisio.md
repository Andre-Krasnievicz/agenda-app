# Plano de Implementação — App de Agenda para Fisioterapeuta (MVP)

> **Para o agente de IA:** este documento é a especificação completa do MVP. Implemente **fase por fase**, na ordem. Ao final de cada fase existe um *checkpoint* — só avance quando ele passar. Não invente features fora do escopo; o que estiver fora está listado na seção 11.

---

## 1. Escopo e decisões fechadas

**Produto:** agenda pessoal de uma fisioterapeuta autônoma para marcar sessões de pacientes, controlar pacotes de sessões contratados e anotar observações clínicas.

**Usuária:** uma pessoa só (a fisioterapeuta). Uso principal no desktop, mas precisa funcionar no celular.

| Decisão | Escolha |
|---|---|
| Visualizações do calendário | **Dia + Semana** |
| Modelo de pacote | **Vários pacotes por paciente, com histórico** (um ativo por vez na prática) |
| Recorrência | **Sim, no MVP** (ex.: 10 sessões, terças e quintas às 14h) |
| Autenticação | **Fora do MVP**, mas o código já nasce preparado (ver 11.2) |
| Fuso horário | **`America/Cuiaba`** (Sorriso-MT). Hoje UTC−4 sem horário de verão, mas **Mato Grosso observava DST até 2019** — ver seção 6 |
| Grade do calendário | Linhas de **1 hora**, das 06:00 às 21:00 (configurável por constante) |
| Duração dos agendamentos | **Minuto a minuto**; padrão 60 min; snap de 15 min ao clicar na grade |
| Banco | PostgreSQL (Neon ou Supabase em produção; Docker local) |

---

## 2. Stack e setup

```
Next.js 15 (App Router) + React 19 + TypeScript (strict)
Route Handlers em app/api/** para o back-end
Prisma 6 + PostgreSQL
Tailwind CSS v4 + shadcn/ui (Dialog, Popover, Select, Command, Sonner)
Zod (validação compartilhada front/back)
React Hook Form + @hookform/resolvers
TanStack Query v5 (cache/invalidação das chamadas HTTP)
date-fns + date-fns-tz
Vitest (testes das funções puras: layout, fuso, contagem de sessões)
better-auth — instalado só na Fase 8 (pós-MVP)
```

### 2.1 Estrutura de pastas

```
src/
  app/
    layout.tsx
    page.tsx                    -> redirect para /agenda
    agenda/page.tsx             -> shell do calendário (dia/semana)
    pacientes/page.tsx          -> lista simples de pacientes e pacotes
    api/
      patients/route.ts
      patients/[id]/route.ts
      patients/[id]/packages/route.ts
      packages/route.ts
      packages/[id]/route.ts
      appointments/route.ts
      appointments/[id]/route.ts
      appointments/[id]/cancel/route.ts
      appointments/[id]/reschedule/route.ts
      appointments/[id]/complete/route.ts
      appointments/series/route.ts
  components/
    calendar/                   -> CalendarShell, DayGrid, WeekGrid, TimeGutter,
                                   AppointmentBlock, NowIndicator, CalendarHeader
    appointment/                -> AppointmentFormDialog, AppointmentDetailsDialog,
                                   CancelFlowDialog, RecurrenceFields
    patient/                    -> PatientCombobox, PackageProgress, PackageForm
    ui/                         -> shadcn
  lib/
    prisma.ts                   -> singleton do PrismaClient
    time.ts                     -> TODA conversão de fuso vive aqui
    calendar-layout.ts          -> posicionamento e colisão dos blocos
    api-client.ts               -> fetch tipado + tratamento de erro
    auth.ts                     -> getCurrentOwnerId() (stub por enquanto)
  server/
    services/                   -> appointment.service.ts, package.service.ts,
                                   patient.service.ts, series.service.ts
    validation/                 -> schemas Zod (importados também pelo front)
    errors.ts                   -> AppError + mapeamento para HTTP
  config/
    calendar.ts                 -> GRID_START_HOUR, GRID_END_HOUR, HOUR_HEIGHT_*, SNAP_MINUTES
prisma/
  schema.prisma
  seed.ts
```

### 2.2 Regra de arquitetura (importante)

Route Handlers são **casca fina**: validam com Zod → chamam um service → traduzem `AppError` em resposta HTTP. **Nenhuma regra de negócio dentro de `route.ts`.** Isso é o que permite plugar o better-auth depois trocando só uma linha (`getCurrentOwnerId`).

---

## 3. Modelo de dados

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Patient {
  id           String        @id @default(cuid())
  ownerId      String        @default("owner-default")
  name         String
  phone        String?
  notes        String?       // observações gerais/clínicas do paciente
  active       Boolean       @default(true)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  packages     Package[]
  appointments Appointment[]

  @@index([ownerId, name])
}

model Package {
  id            String        @id @default(cuid())
  ownerId       String        @default("owner-default")
  patientId     String
  patient       Patient       @relation(fields: [patientId], references: [id], onDelete: Restrict)

  label         String?       // ex.: "Pacote 10 sessões - joelho direito"
  totalSessions Int
  priceCents    Int           // valor do pacote inteiro, em centavos
  purchasedAt   DateTime      @default(now())
  status        PackageStatus @default(ACTIVE)
  notes         String?

  appointments  Appointment[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([patientId, status])
}

enum PackageStatus {
  ACTIVE
  COMPLETED
  CANCELED
}

model Appointment {
  id              String            @id @default(cuid())
  ownerId         String            @default("owner-default")

  patientId       String
  patient         Patient           @relation(fields: [patientId], references: [id], onDelete: Restrict)
  packageId       String?
  package         Package?          @relation(fields: [packageId], references: [id], onDelete: SetNull)

  startsAt        DateTime          // sempre UTC
  endsAt          DateTime          // sempre UTC (derivado da duração)
  status          AppointmentStatus @default(SCHEDULED)
  consumesSession Boolean           @default(true) // derivado do status, ver 4.1
  notes           String?           // observação daquela sessão específica

  seriesId        String?           // agrupa agendamentos criados por recorrência

  rescheduledFromId String?         @unique
  rescheduledFrom   Appointment?    @relation("Reschedule", fields: [rescheduledFromId], references: [id])
  rescheduledTo     Appointment?    @relation("Reschedule")

  canceledAt      DateTime?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([ownerId, startsAt])
  @@index([packageId, startsAt])
  @@index([seriesId])
}

enum AppointmentStatus {
  SCHEDULED        // marcado, ainda vai acontecer
  COMPLETED        // realizado
  CANCELED_COUNTED // paciente faltou/cancelou e a sessão foi cobrada mesmo assim
  CANCELED_FREE    // cancelado sem consumir sessão (devolve ao pacote)
  RESCHEDULED      // foi movido para outra data; a nova ocorrência é outro registro
}
```

### 3.1 Por que o número da sessão **não** é uma coluna

`sessionNumber` é **sempre calculado na leitura**: ordena os agendamentos do pacote que consomem sessão por `startsAt` e usa a posição (1-based). Assim, se ela reagendar a 3ª sessão para depois da 4ª, a numeração se corrige sozinha e nunca dessincroniza. Nunca persista esse número.

### 3.2 Paciente não se apaga

`onDelete: Restrict` é intencional: apagar um paciente levaria junto todo o histórico de atendimentos e pacotes pagos. A UI **não oferece excluir paciente** — oferece **"Arquivar"** (`active = false`), que some da busca do agendamento mas mantém o histórico. Exclusão real, se um dia precisar, é tarefa de banco.

---

## 4. Regras de negócio

### 4.1 Contagem de sessões

`consumesSession` é derivado do status, e mantido em **um único lugar** (`appointment.service.ts`, função `statusConsumesSession(status)`):

| Status | Consome sessão? |
|---|---|
| `SCHEDULED` | ✅ sim (a sessão já está reservada no pacote) |
| `COMPLETED` | ✅ sim |
| `CANCELED_COUNTED` | ✅ sim |
| `CANCELED_FREE` | ❌ não |
| `RESCHEDULED` | ❌ não (quem consome é o novo registro) |

Contadores do pacote (calculados, expostos em `GET /api/packages/:id` e junto do paciente):

```
consumidas  = COMPLETED + CANCELED_COUNTED
reservadas  = SCHEDULED
disponiveis = totalSessions - consumidas - reservadas
sessionNumber(a) = posição de `a` entre os agendamentos do pacote
                   com consumesSession = true, ordenados por startsAt
```

Ao criar um agendamento vinculado a pacote com `disponiveis <= 0` → erro `422 PACKAGE_EXHAUSTED` com mensagem *"Este pacote já tem todas as 10 sessões agendadas."* e opção no front de criar um novo pacote.

Quando `consumidas === totalSessions`, o pacote vira `COMPLETED` automaticamente (dentro da mesma transação que alterou o agendamento).

### 4.2 Conflito de horário

Antes de criar/mover, verificar sobreposição para o mesmo `ownerId`:

```sql
startsAt < :novoFim AND endsAt > :novoInicio
AND status IN ('SCHEDULED', 'COMPLETED')
AND id <> :idAtual
```

Retornar `409 SLOT_CONFLICT` com os dados do agendamento conflitante. No front: modal de confirmação *"Já existe **Maria Silva** das 14:00 às 15:00. Agendar mesmo assim?"* — permitir forçar com `?allowOverlap=true` (a agenda é dela; bloquear de vez seria mais atrapalho que ajuda), e o calendário renderiza os dois lado a lado.

### 4.3 Cancelamento e reagendamento (fluxo central do produto)

Ao clicar em **Cancelar** no popup do agendamento, abrir um diálogo com **três caminhos**:

1. **"Cancelar e contar a sessão"** → `status = CANCELED_COUNTED`, `canceledAt = now`. A sessão é consumida do pacote. Bloco fica riscado no calendário.
2. **"Reagendar para outra data"** → pede data + horário (o mesmo seletor do formulário, com validação de conflito). Em **uma transação**:
   - original: `status = RESCHEDULED`, `consumesSession = false`, `canceledAt = now`
   - cria novo `Appointment` no novo horário, mesmo paciente/pacote, copiando `notes`, com `rescheduledFromId` apontando para o original
   - o novo registro aparece no popup com a etiqueta *"Reagendado de 12/03 14:00"*
3. **"Cancelar sem contar a sessão"** → `status = CANCELED_FREE`. A sessão volta a ficar disponível no pacote.

> Se o agendamento fizer parte de uma série (`seriesId`), perguntar: **"Só este"** ou **"Este e os próximos"**. No MVP, "este e os próximos" aplica apenas a `CANCELED_FREE`.

### 4.4 Recorrência

Entrada: `patientId`, `packageId`, `weekdays: number[]` (0–6), `time: "HH:mm"`, `durationMinutes`, `startDate`, e **`count`** (nº de ocorrências) ou `untilDate`.

- `count` tem teto automático nas **sessões disponíveis do pacote** — e a UI mostra isso: *"Restam 8 sessões neste pacote."*
- `POST /api/appointments/series?dryRun=true` retorna a **prévia**: lista de datas + flag `conflict` em cada uma. O front mostra a lista antes de confirmar.
- Confirmação: cria tudo numa transação com um `seriesId` compartilhado. Ocorrências em conflito são criadas mesmo assim se `allowOverlap`, senão são puladas e reportadas em `skipped[]`.

> **Geração sempre em hora local, nunca somando milissegundos.** Itere as datas no calendário local (`addDays` sobre a data local, mantendo o `HH:mm` da usuária) e só então converta cada ocorrência com `toUtc()`. Somar `7 * 24 * 60 * 60 * 1000` em UTC funciona hoje, mas se o horário de verão voltar em MT a série inteira desliza uma hora no meio do caminho — e ela só vai descobrir com a paciente batendo na porta no horário errado.

### 4.5 Sessões passadas

Agendamento `SCHEDULED` cujo `endsAt` já passou é renderizado com aparência "a confirmar" e um botão **"Marcar como realizada"** (→ `COMPLETED`). **Não existe job automático no MVP.** Como `SCHEDULED` já consome sessão, a contagem do pacote fica correta mesmo se ela nunca confirmar.

### 4.6 Validações de borda (não esqueça destas)

| Situação | Regra |
|---|---|
| Editar o pacote e reduzir `totalSessions` abaixo das já consumidas | Rejeitar: `422 PACKAGE_TOO_SMALL` — *"Este pacote já tem 6 sessões usadas."* |
| Reagendar uma sessão para um horário no passado | Permitir (ela pode estar lançando algo que já aconteceu), mas confirmar no diálogo |
| Duração ≤ 0 ou > 8h | `400 VALIDATION_ERROR` |
| Duplo clique no botão salvar | Desabilitar o botão enquanto a mutação está em voo **e**, no service, checar se já existe agendamento ativo do mesmo paciente no mesmo `startsAt` — se existir, devolver o existente em vez de criar outro. Sem constraint no banco: ela pode legitimamente recriar um horário que cancelou antes. |
| Trocar o paciente de um agendamento já vinculado a pacote | Limpar o `packageId` e forçar nova escolha; nunca deixar agendamento de um paciente consumindo pacote de outro |
| Pacote com `status = CANCELED` | Não aparece no seletor de pacotes do formulário |

---

## 5. Contrato da API

Envelope de erro padrão em todas as rotas:

```json
{ "error": { "code": "SLOT_CONFLICT", "message": "texto legível", "details": {} } }
```

Códigos: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `SLOT_CONFLICT` (409), `PACKAGE_EXHAUSTED` (422), `PACKAGE_TOO_SMALL` (422), `INTERNAL` (500).

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/appointments?from=&to=` | Agendamentos no intervalo (ISO UTC, semiaberto). Retorna paciente, pacote e `sessionNumber` já resolvidos. **Por padrão traz apenas `SCHEDULED`, `COMPLETED` e `CANCELED_COUNTED`** — `CANCELED_FREE` e `RESCHEDULED` só com `?includeCanceled=true`, senão a grade mostra fantasmas de coisas que ela já resolveu. |
| POST | `/api/appointments` | Cria. Body: `patientId`, `packageId?`, `startsAt`, `durationMinutes`, `notes?`. Query: `allowOverlap`. |
| GET | `/api/appointments/:id` | Detalhe completo (usado pelo popup). |
| PATCH | `/api/appointments/:id` | Edita horário/duração/observações. |
| DELETE | `/api/appointments/:id` | Exclusão real — só para agendamento criado por engano. |
| POST | `/api/appointments/:id/cancel` | Body: `{ mode: "COUNT" \| "FREE" }`. |
| POST | `/api/appointments/:id/reschedule` | Body: `{ startsAt, durationMinutes? }`. Transação da regra 4.3. |
| POST | `/api/appointments/:id/complete` | → `COMPLETED`. |
| POST | `/api/appointments/series` | Recorrência. `?dryRun=true` para prévia. |
| GET | `/api/patients?q=` | Busca por nome (autocomplete). Inclui pacote ativo e contadores. |
| POST | `/api/patients` | Cria paciente. Aceita `package` aninhado para criar tudo de uma vez. |
| GET/PATCH | `/api/patients/:id` | Detalhe e edição. |
| GET/POST | `/api/patients/:id/packages` | Histórico de pacotes e criação de novo. |
| PATCH | `/api/packages/:id` | Edita total/valor/status. |
| GET | `/api/export` | JSON completo (pacientes, pacotes, agendamentos) para backup manual. |

### 5.1 Formato de resposta de um agendamento

```ts
type AppointmentDTO = {
  id: string
  startsAt: string          // ISO UTC
  endsAt: string
  durationMinutes: number
  status: AppointmentStatus
  notes: string | null
  seriesId: string | null
  rescheduledFrom: { id: string; startsAt: string } | null
  patient: { id: string; name: string; phone: string | null; notes: string | null }
  package: {
    id: string
    label: string | null
    totalSessions: number
    priceCents: number
    consumidas: number
    reservadas: number
    disponiveis: number
  } | null
  sessionNumber: number | null   // ex.: 4  -> "Sessão 4 de 10"
}
```

---

## 6. Fuso horário — regras inegociáveis

Tudo em `src/lib/time.ts`. **Nenhum outro arquivo pode fazer conversão de fuso.**

> **Por que isso importa mais aqui do que parece:** Sorriso fica em Mato Grosso, que **observou horário de verão até 2019**. O Brasil extinguiu o DST, mas o assunto volta ao debate periodicamente — e se voltar, Mato Grosso adere. Portanto: **nunca hardcode `-04:00` ou `UTC-4` em lugar nenhum.** Use sempre o identificador IANA `America/Cuiaba` e deixe a biblioteca resolver o offset da data em questão. Se o DST voltar, basta atualizar o `tzdata` (o `date-fns-tz` usa o `Intl` do runtime) e nada mais no código muda.

```ts
export const APP_TZ = 'America/Cuiaba'   // Sorriso-MT

// UI (data/hora locais) -> banco
export const toUtc = (localDate: Date) => fromZonedTime(localDate, APP_TZ)
// banco -> UI
export const toLocal = (utcDate: Date | string) => toZonedTime(utcDate, APP_TZ)

export const localDayRange  = (day: Date) => ({ from, to })  // [00:00, 00:00 do dia seguinte) — semiaberto
export const localWeekRange = (day: Date) => ({ from, to })  // semana começando na segunda, semiaberto
export const localMinutesFromMidnight = (utcDate: Date) => number  // usado pelo layout
```

> Dois detalhes que economizam horas de depuração: o intervalo é **semiaberto** (`>= from && < to`), nunca `23:59:59` — senão um agendamento às 23:59:30 desaparece; e o helper de minutos conta **a partir da meia-noite local**, não a partir de `GRID_START_HOUR`. O nome antigo (`minutesFromDayStart`) convidava a subtrair o início da grade duas vezes.

Armadilhas a evitar: `new Date("2026-03-12")` (vira meia-noite UTC), `date.getHours()` no servidor, e `toISOString().slice(0,10)` para extrair "o dia" — todos quebram num fuso negativo. Em UTC−4, um atendimento das 21:00 é gravado como o **dia seguinte** em UTC: se a listagem do dia for montada com `slice(0,10)`, esse agendamento some da tela.

---

## 7. Interface

### 7.1 Layout da tela `/agenda`

```
┌────────────────────────────────────────────────────────────────────┐
│  ◀  ▶   [ Hoje ]     sexta, 14 de agosto de 2026    [Dia|Semana]   │
│                                              [ + Novo agendamento ]│
├──────┬─────────────────────────────────────────────────────────────┤
│ 06   │                                                             │
│ 07   │                                                             │
│ 08   │  ┌──────────────────────────────┐                           │
│ 09   │  │ Ana Costa · Sessão 4/10      │  <- bloco 08:00–09:30     │
│ 09.5 │  └──────────────────────────────┘     (ocupa 1h30)          │
│ 10   │ ─── ─── ─── ─── linha do agora ─── ─── ───                  │
│ 11   │                                                             │
└──────┴─────────────────────────────────────────────────────────────┘
```

- Cabeçalho fixo (sticky). No mobile, `Dia` é forçado e o toggle some.
- Coluna de horas (`TimeGutter`) em fonte mono, alinhada ao topo de cada linha.
- Na visão Semana, o dia de hoje tem a coluna com fundo levemente tingido e o cabeçalho com o marcador circular do dia.

### 7.2 Mecânica da grade (`lib/calendar-layout.ts`)

```ts
// config/calendar.ts
GRID_START_HOUR     = 6    // primeira linha renderizada
GRID_END_HOUR       = 22   // última linha (exclusiva) — a grade rola até aqui
INITIAL_SCROLL_HOUR = 7    // onde a tela abre posicionada
HOUR_HEIGHT_DAY     = 64   // px
HOUR_HEIGHT_WEEK    = 56   // px
SNAP_MINUTES        = 15
MIN_BLOCK_PX        = 22
WEEK_STARTS_ON      = 1    // segunda-feira
```

> A grade vai até as 22h para caber um atendimento das 20:30 com 90 min sem estourar. Se algum agendamento cair fora do intervalo (ela lançou algo às 05:00), a grade **expande automaticamente** para conter o mais cedo e o mais tarde do dia — nunca esconda um agendamento por causa da constante.

**Posição do bloco** (é isso que faz 1h30 ocupar metade da linha seguinte):

```ts
// HOUR_HEIGHT abaixo = HOUR_HEIGHT_DAY ou HOUR_HEIGHT_WEEK, conforme a visão ativa
const offsetMin = localMinutesFromMidnight(startsAt) - GRID_START_HOUR * 60
const top       = (offsetMin / 60) * HOUR_HEIGHT
const height    = Math.max((durationMinutes / 60) * HOUR_HEIGHT, MIN_BLOCK_PX)
```

**Clique em espaço vazio → cria naquele horário:**

```ts
// ATENÇÃO: use o rect do elemento INTERNO (o que rola junto com o conteúdo),
// não o do container com overflow. Se pegar o rect do container e ainda somar
// scrollTop, o horário sai errado assim que a página estiver rolada.
const rect    = contentRef.current.getBoundingClientRect()
const y       = event.clientY - rect.top
const rawMin  = GRID_START_HOUR * 60 + (y / HOUR_HEIGHT) * 60
const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES
// abre AppointmentFormDialog já preenchido com esse horário
```

O campo de horário no formulário aceita **qualquer minuto** (input `type="time"`); o snap vale só para o clique.

**Sobreposição:** agrupar blocos que se cruzam; dentro do grupo, atribuir colunas gulosamente (a primeira coluna cujo último bloco já terminou). `width = 100% / nColunas`, `left = coluna * width`, com 2px de gap. Implementar como função pura e testar com casos: nenhum overlap, dois sobrepostos, três em cadeia.

> **Cancelados não disputam espaço.** Um agendamento `CANCELED_COUNTED` continua visível (ela precisa ver que a paciente faltou), mas o horário está livre — e o conflito da regra 4.2 ignora ele de propósito. Se ele entrasse no cálculo de colunas, marcar outra paciente naquele horário espremeria o novo agendamento pela metade. Então: blocos cancelados são renderizados **atrás**, em largura reduzida (encostados à direita, ~24px), fora do algoritmo de colunas.

**Linha do agora:** só aparece se o dia visível é hoje; posição pela mesma fórmula; atualiza a cada 60s com `setInterval`.

**Scroll inicial:** ao abrir, posicionar em `INITIAL_SCROLL_HOUR`; se o dia visível é hoje, posicionar na linha do agora menos uma hora. Ao trocar de dia, **preservar** a posição de scroll — nada mais irritante que perder o lugar a cada seta.

### 7.3 Diálogos

**A. `AppointmentFormDialog`** (novo/editar)
- Paciente: `PatientCombobox` — busca por nome, e se não achar oferece **"Criar paciente 'João'"** ali mesmo, junto com os campos de pacote (total de sessões, valor). Ela nunca deve ser obrigada a sair da agenda para cadastrar alguém.
- Pacote: select com os pacotes do paciente, ativo pré-selecionado, mostrando *"5 de 10 usadas"*. Opção "Sessão avulsa (sem pacote)".
- Data, hora início, duração (chips 30/45/60/90 min + campo livre).
- Observações da sessão.
- Aba/switch **"Repetir"** → `RecurrenceFields`: dias da semana, nº de ocorrências (limitado pelas disponíveis) ou data final, e a prévia com as datas geradas e avisos de conflito.

**B. `AppointmentDetailsDialog`** (clique no bloco) — mostra:
- Nome do paciente, telefone (link `tel:`)
- Horário e duração
- **`PackageProgress`**: *"Sessão 4 de 10"* + barra segmentada (ver 8.3)
- Valor do pacote e valor médio por sessão (`priceCents / totalSessions`)
- Observações do paciente (gerais) e da sessão (editável inline)
- Etiqueta "Reagendado de …" quando aplicável
- Ações: **Editar** · **Marcar como realizada** · **Cancelar** · (⋯ Excluir)

**C. `CancelFlowDialog`** — os três caminhos da regra 4.3, com o efeito de cada um escrito em texto claro:
- *"Cancelar e contar a sessão"* → sub-texto: *"A sessão 4 de 10 será considerada usada."*
- *"Reagendar"* → abre o seletor de data/hora, com verificação de conflito antes de confirmar.
- *"Cancelar e devolver a sessão"* → *"O pacote volta a ter 7 sessões disponíveis."*

### 7.4 Estados vazios, erros e feedback

- Dia sem agendamentos: *"Nenhum atendimento neste dia."* + botão "Agendar às 08:00".
- Erro de rede: toast com ação "Tentar de novo"; nada de mensagem genérica.
- Toda mutação usa `useMutation` + invalidação da query do intervalo visível. Atualização otimista **só** em criar/mover; cancelamento e reagendamento esperam a resposta (mexem em contadores).

### 7.5 Atalhos de teclado (baratos e muito úteis no uso diário)

`T` = hoje · `←`/`→` = dia/semana anterior/próximo · `D`/`S` = alternar visão · `N` = novo agendamento · `Esc` = fechar diálogo.

---

## 8. Design

Direção: **clínica clara, não hospitalar.** A referência não é "app de saúde genérico com azul corporativo", é o consultório dela: luz natural, superfícies claras, verde-água, e a precisão de uma ficha de evolução. O calendário é o produto inteiro — tudo em volta fica quieto.

### 8.1 Paleta (tokens em `globals.css`, Tailwind v4 `@theme`)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#F4F7F5` | fundo da aplicação (branco levemente esverdeado) |
| `--surface` | `#FFFFFF` | grade do calendário, cards, diálogos |
| `--ink` | `#10302A` | texto principal (verde-pinho, não preto) |
| `--ink-muted` | `#5C7871` | rótulos, horas, texto secundário |
| `--line` | `#E2EAE7` | linhas da grade e bordas |
| `--primary` | `#0F766E` | ação principal, blocos agendados, hoje |
| `--primary-soft` | `#CFE9E3` | preenchimento dos blocos, hover de slot |
| `--accent` | `#E9A23B` | âmbar: linha do agora, alerta de pacote acabando |
| `--danger` | `#C2544D` | cancelar, conflito |

O âmbar existe para uma coisa só: **tempo** (agora, e "restam 2 sessões"). Se ele aparecer em outro lugar, perde a função.

### 8.2 Tipografia

- **Display / cabeçalhos:** `Sora` (600) — geométrica, contemporânea, sem parecer bootstrap.
- **Corpo / interface:** `Inter` (400/500).
- **Horas, contadores, valores:** `IBM Plex Mono` (450) — a coluna de horários em mono alinha os dígitos e dá o ar de ficha clínica. É o detalhe que diferencia a tela.

Escala: 12 / 13 / 15 / 18 / 24 / 32. Títulos em *sentence case*, nunca CAIXA ALTA.

### 8.3 Elemento assinatura — `PackageProgress`

O progresso do pacote **não** é uma barra contínua: são **10 segmentos** (ou N), preenchidos como quem conta repetições de um exercício. Preenchido = sessão consumida; contornado = agendada; vazio = disponível. Segmento riscado = cancelada e contada. Aparece no popup do agendamento e na lista de pacientes, e é a coisa que ela vai olhar todo dia.

Acima de 20 sessões os segmentos ficam ilegíveis: nesse caso, cair para uma barra contínua com o mesmo esquema de cores e o texto `18/30`. O componente decide sozinho pelo `totalSessions`.

### 8.4 Blocos de agendamento

| Estado | Aparência |
|---|---|
| Agendado | fundo `--primary-soft`, barra esquerda 3px `--primary`, texto `--ink` |
| Realizado | fundo branco, borda `--line`, barra esquerda `--ink-muted`, ✓ discreto |
| Cancelado (contou) | fundo listrado sutil, texto riscado em `--ink-muted` |
| Cancelado (livre) | não aparece na grade (só no histórico do paciente) |
| Reagendado | não aparece na grade; visível no popup do novo agendamento |

Conteúdo do bloco: `Nome · 14:00–15:30` e, se couber (altura ≥ 44px), `Sessão 4/10`. Abaixo de 44px, só o nome. Raio 8px, sem sombra — profundidade vem da cor, não de sombra.

### 8.5 Piso de qualidade

Responsivo até 360px (visão Dia com colunas full-width), foco de teclado visível em todos os controles, `prefers-reduced-motion` respeitado (transições ≤ 150ms, sem animação na troca de dia), contraste AA em texto sobre `--primary-soft`.

Cada bloco de agendamento é um `<button>` de verdade (não uma `div` com `onClick`): navegável por Tab, aberto com Enter, com `aria-label` do tipo *"Ana Costa, 8h às 9h30, sessão 4 de 10"*. No mobile, a área clicável de um bloco curto nunca fica abaixo de 32px de altura mesmo que a duração seja de 20 minutos.

---

## 9. Fases de implementação

### Fase 0 — Fundação
Projeto Next.js + TS + Tailwind v4 + shadcn. Postgres via Docker (`docker-compose.yml`). Prisma com o schema da seção 3, primeira migration. `lib/prisma.ts`, `lib/time.ts`, `config/calendar.ts`, `lib/auth.ts` com `getCurrentOwnerId()` retornando `"owner-default"`. Tokens de cor e fontes no `globals.css`. `prisma/seed.ts` com 4 pacientes, 2 pacotes cada e ~15 agendamentos espalhados na semana atual (incluindo um de 1h30, um cancelado-contado e um reagendado).
**Checkpoint:** `npx prisma migrate dev && npx prisma db seed` roda limpo; `/agenda` renderiza uma página vazia com as fontes e cores corretas.

### Fase 1 — Domínio e API de pacientes/pacotes
Schemas Zod, `errors.ts`, services de paciente e pacote com os contadores da regra 4.1. Rotas `/api/patients*` e `/api/packages*`.
**Checkpoint:** criar paciente com pacote via `curl`, buscar por nome e ver `consumidas/reservadas/disponiveis` corretos.

### Fase 2 — API de agendamentos
`appointment.service.ts` completo: criar (com checagem de conflito 4.2 e de pacote esgotado), editar, cancelar (COUNT/FREE), reagendar (transação 4.3), completar. Cálculo de `sessionNumber` na leitura. Rota de listagem por intervalo.
**Checkpoint:** testes (Vitest) cobrindo: numeração de sessão após reagendamento, pacote esgotado, detecção de conflito, pacote virando COMPLETED na última sessão.

### Fase 3 — Calendário (visão Dia)
`CalendarShell` com estado de data e visão na URL (`?date=2026-08-14&view=day`). `TimeGutter`, `DayGrid` com blocos posicionados, `NowIndicator`, `CalendarHeader` com ◀ ▶ / **Hoje** / hoje destacado. `calendar-layout.ts` com testes unitários.
**Checkpoint:** um agendamento das 08:00 às 09:30 ocupa exatamente uma linha e meia; navegação de dias e o botão Hoje funcionam; a linha do agora está no lugar certo.

### Fase 4 — Criar agendamento
`AppointmentFormDialog` + `PatientCombobox` (com criação inline de paciente e pacote). Clique no slot vazio abre o form com horário pré-preenchido. Botão "Novo agendamento". Integração com TanStack Query.
**Checkpoint:** ela consegue, sem sair da agenda, cadastrar uma paciente nova com pacote de 10 sessões e marcar a primeira sessão clicando nas 14:15 da grade.

### Fase 5 — Detalhes, cancelar, reagendar
`AppointmentDetailsDialog` com `PackageProgress`, `CancelFlowDialog` com os três caminhos, edição inline de observações, "Marcar como realizada".
**Checkpoint:** cancelar contando reduz as disponíveis e risca o bloco; reagendar move o bloco para a nova data mantendo "Sessão 4 de 10" e mostrando "Reagendado de …".

### Fase 6 — Visão Semana e recorrência
`WeekGrid` (7 colunas, mesmo motor de layout, coluna de hoje destacada). `RecurrenceFields` + `POST /api/appointments/series` com prévia e cancelamento de série.
**Checkpoint:** criar 10 sessões às terças e quintas às 14h em um pacote de 10 gera exatamente 10 blocos, para de gerar ao esgotar o pacote e sinaliza conflitos na prévia.

### Fase 7 — Acabamento e entrega
Página `/pacientes` (lista + histórico de pacotes + progresso). Estados vazios, toasts, atalhos de teclado, responsivo mobile, `loading.tsx`/`error.tsx`. Deploy na Vercel + Neon, com **proteção de acesso** (ver 11.1). Incluir `GET /api/export` devolvendo um JSON com tudo (pacientes, pacotes, agendamentos) e um botão "Baixar meus dados" — é a rede de segurança dela enquanto o app é um MVP, e leva 20 minutos. Confirmar que o backup automático do Neon está ativo.
**Checkpoint:** ela usa em produção, pelo celular e pelo notebook, uma semana inteira de agenda real.

---

## 10. Critérios de aceite (checklist final)

- [ ] Grade de 1h, agendamento de 1h30 ocupa metade da linha seguinte
- [ ] Clicar em horário vazio abre o formulário já naquele horário
- [ ] Botão "Novo agendamento" abre o formulário vazio
- [ ] ◀ ▶ navegam dia a dia (e semana a semana na visão semanal)
- [ ] Botão "Hoje" volta para o dia atual, e o dia atual fica destacado
- [ ] Agendamento guarda: paciente, pacote, nº de sessões contratadas, valor do pacote, observações
- [ ] Clicar no bloco abre popup com todos os dados **e** "Sessão X de N"
- [ ] A contagem de sessões avança sozinha conforme os agendamentos daquele paciente
- [ ] Cancelar oferece: contar a sessão · reagendar (pedindo a nova data) · devolver a sessão
- [ ] Reagendar cria a nova ocorrência e mantém a numeração coerente
- [ ] Recorrência cria várias sessões respeitando o saldo do pacote
- [ ] Nada quebra na virada do dia por causa de fuso (`America/Cuiaba`) — atendimento das 21:00 aparece no dia certo
- [ ] Paciente pode ser arquivado, nunca excluído com histórico junto
- [ ] Botão de exportar os dados funciona
- [ ] Funciona em tela de 360px

---

## 11. Fora do escopo do MVP

### 11.1 Segurança provisória (atenção — não pule)

O MVP não tem login, mas vai guardar **nome, telefone e anotações clínicas de pacientes reais**. Enquanto o better-auth não entra:

- ative **Vercel Deployment Protection** (senha) no projeto, **ou**
- coloque um `middleware.ts` com um cookie de segredo compartilhado definido por uma rota `/entrar?k=...`.

Não deixe a URL pública aberta. É o suficiente para o MVP e leva 10 minutos.

### 11.2 Preparado para o better-auth (Fase 8)

O caminho já está pavimentado: todo modelo tem `ownerId` e todo service recebe o owner de `getCurrentOwnerId()`. Para plugar depois: instalar better-auth, criar a tabela `User`, trocar o corpo de `getCurrentOwnerId()` para ler a sessão, rodar uma migration que substitui `"owner-default"` pelo id real dela, e remover o `@default` da coluna. Nenhum service muda.

### 11.3 Deixado para depois

Financeiro (pagamentos, recibos, inadimplência) · lembretes por WhatsApp/e-mail · prontuário e evolução clínica estruturada · múltiplos profissionais · portal do paciente · relatórios · bloqueio de horários/férias · importação de agenda · arrastar-e-soltar para remarcar (bom candidato à primeira melhoria pós-MVP).

---

## 12. Armadilhas conhecidas

1. **Fuso:** toda data cruza a fronteira UTC↔local só em `lib/time.ts`, sempre via `America/Cuiaba`. Se aparecer `getHours()`, `new Date("YYYY-MM-DD")` ou um offset fixo `-04:00` em qualquer outro arquivo, está errado.
2. **Numeração de sessão:** calculada, nunca persistida (seção 3.1).
3. **`consumesSession`:** derivado do status em uma única função; não atribua manualmente em lugar nenhum.
4. **Transações:** cancelar+reagendar e criar série usam `prisma.$transaction`. Meio-caminho aqui corrompe a contagem do pacote.
5. **Fim do dia:** um agendamento das 20:30 com 90 min termina às 22:00. A grade vai até `GRID_END_HOUR = 22` e **expande** se houver algo fora do intervalo. Nunca corte um bloco por causa da constante.
6. **Sobreposição:** teste o algoritmo de colunas com blocos em cadeia (A cruza B, B cruza C, A não cruza C) — é onde implementações ingênuas erram. E lembre que cancelados ficam fora desse cálculo (seção 7.2).
7. **Fuso do servidor:** rode o Postgres e o Node em UTC (`TZ=UTC`), inclusive no Docker local. A Vercel roda em UTC; se a sua máquina rodar em UTC−4, um bug de fuso passa despercebido no dev e só aparece em produção — que é justamente onde ela está usando.
8. **Teste de fuso obrigatório:** um teste que cria um atendimento às 21:00 local, salva, relê pela rota de listagem do dia e confirma que ele aparece **naquele dia**. É o teste que pega 90% dos erros de data neste app.
