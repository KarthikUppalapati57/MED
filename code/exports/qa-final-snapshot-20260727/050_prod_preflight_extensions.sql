create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;