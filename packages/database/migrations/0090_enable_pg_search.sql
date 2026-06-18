-- Custom SQL migration file, put your code below! --
-- pg_search (ParadeDB) was deprecated on Neon for new projects on March 19, 2026.
-- Query neon.deprecated_extensions first (via EXECUTE to avoid parse errors on non-Neon hosts)
-- so we never call CREATE EXTENSION when it would be rejected.
DO $$
DECLARE
  skip_install boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM neon.deprecated_extensions WHERE name = $1)'
      USING 'pg_search' INTO skip_install;
  EXCEPTION WHEN OTHERS THEN
    -- Not a Neon database or the view does not exist — assume extension is available
    skip_install := false;
  END;

  IF skip_install THEN
    RAISE NOTICE 'pg_search is deprecated on this Neon project — skipping installation';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_search;
END
$$;
