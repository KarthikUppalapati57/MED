-- ============================================================
-- 010: FIX MISSING INVOICE COLUMNS
-- The live Supabase database is missing columns that the app sends.
-- These columns exist in 001_initial_schema.sql but were never applied.
-- ============================================================

-- Add missing columns to the invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fuel_surcharge NUMERIC(10,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS other_charges NUMERIC(10,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual_upload';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validation_results JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approved_date TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- DONE! Run this in the Supabase SQL Editor.
-- ============================================================
