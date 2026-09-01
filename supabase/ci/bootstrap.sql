\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS vault;

DO $$
BEGIN
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    RAISE EXCEPTION 'Supabase test image is missing auth.jwt()';
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Supabase test image is missing storage.buckets';
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Supabase test image is missing storage.objects';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA public;
