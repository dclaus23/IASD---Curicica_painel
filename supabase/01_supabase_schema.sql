-- ============================================================
-- IASD Curicica — Tesouraria — Schema do Supabase
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- ============================================================

-- Uma linha por mês (chave "AAAA-MM"). O conteúdo em "data" tem o
-- mesmo formato que o painel HTML já usava internamente (entrada,
-- saida, departments, categoriaRows, source, etc.) — isso permite
-- reaproveitar quase todo o código do painel sem reescrever.
create table if not exists monthly_data (
  month_key  text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Uma linha única (id fixo = 1) guardando a classificação de
-- categorias (Entrada / Saída / Excluir) compartilhada entre todos
-- os meses, igual à seção 3 do painel.
create table if not exists app_settings (
  id                int primary key default 1,
  category_registry jsonb not null default '{}'::jsonb,
  category_filters  jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- Segurança: qualquer pessoa com o link pode LER (é assim que o
-- painel funciona no celular/notebook, sem login). Só quem tiver a
-- chave "service_role" (fica só no seu PC, dentro do vigia de pasta)
-- pode ESCREVER. Ninguém mais consegue alterar os dados.
alter table monthly_data enable row level security;
alter table app_settings  enable row level security;

drop policy if exists "public read monthly_data" on monthly_data;
create policy "public read monthly_data" on monthly_data
  for select using (true);

drop policy if exists "public read app_settings" on app_settings;
create policy "public read app_settings" on app_settings
  for select using (true);

-- Exceção: a classificação de categorias (Entrada/Saída/Excluir) PODE ser
-- alterada direto pelo painel, de qualquer dispositivo (é só uma preferência,
-- não é dado financeiro em si). Os valores em si (monthly_data) continuam
-- protegidos — só o vigia de pasta, com a chave service_role, escreve neles.
drop policy if exists "public update app_settings" on app_settings;
create policy "public update app_settings" on app_settings
  for update using (true) with check (true);

-- ============================================================
-- Atualização: percentuais de rateio por categoria (ex.: oferta de
-- pacto 60% igreja / 40% Associação). Um conjunto para as categorias
-- do resumo financeiro, outro para as categorias da Fidelidade
-- (são sistemas de código diferentes, não misturar).
-- Rode só este bloco se seu banco já foi criado antes dessa data.
-- ============================================================
alter table app_settings add column if not exists category_percentages jsonb not null default '{}'::jsonb;
alter table app_settings add column if not exists category_percentages_fidelidade jsonb not null default '{}'::jsonb;
