-- ============================================================
-- MIYU BEAUTY — Schema de Supabase
-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- ── Conversaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversaciones (
  telefono       TEXT        PRIMARY KEY,
  mensajes       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Perfiles de clientes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS perfiles (
  telefono       TEXT        PRIMARY KEY,
  datos          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Pedidos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos_db (
  id             TEXT        PRIMARY KEY,
  datos          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  estado         TEXT        NOT NULL DEFAULT 'pendiente',
  telefono       TEXT        NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para buscar pedidos por teléfono
CREATE INDEX IF NOT EXISTS idx_pedidos_db_telefono ON pedidos_db (telefono);

-- ── Leads / scoring ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  telefono       TEXT        PRIMARY KEY,
  score          INTEGER     NOT NULL DEFAULT 0,
  etapa          TEXT        NOT NULL DEFAULT 'frio',
  datos          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Inventario ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_db (
  id             TEXT        PRIMARY KEY,
  datos          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security (RLS) — desactívalo si usas service_role key ──
-- Por defecto Supabase bloquea acceso anónimo.
-- Con la service_role key (SUPABASE_KEY) el acceso es de administrador
-- y RLS no aplica. No es necesario cambiar nada.
