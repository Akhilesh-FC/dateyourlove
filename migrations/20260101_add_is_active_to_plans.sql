-- Migration: Add is_active to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;
