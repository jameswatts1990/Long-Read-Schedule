# Query plan verification

After applying migrations, run these commands against Postgres to confirm index usage for the storage query patterns.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM assignments
WHERE workspace_id = 'workspace-id'
  AND week_start_date = '2026-01-05';

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM assignments
WHERE workspace_id = 'workspace-id'
  AND week_start_date >= '2026-01-05'
  AND week_start_date <= '2026-02-02';

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM people
WHERE workspace_id = 'workspace-id'
ORDER BY "order";

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM tasks
WHERE workspace_id = 'workspace-id'
ORDER BY "order";

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM premade_filters
WHERE workspace_id = 'workspace-id';

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM workspace_users
WHERE user_id = 'user-id'
  AND workspace_id = 'workspace-id';

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM workspace_users
WHERE workspace_id = 'workspace-id'
  AND user_id = 'user-id';
```
