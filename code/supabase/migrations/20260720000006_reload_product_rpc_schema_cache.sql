BEGIN;

-- Make the newly added product catalog RPCs visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
