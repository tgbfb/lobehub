-- Custom SQL migration file, put your code below! --
-- pg_search (ParadeDB) is deprecated on Neon; skip gracefully if unavailable
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_search;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_search extension not available (%), skipping', SQLERRM;
END
$$;