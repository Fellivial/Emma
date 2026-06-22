-- LB-01: add connection_expiry to pattern_detections_pattern_type_check constraint.
-- The connection-health cron inserts rows with pattern_type = 'connection_expiry' which
-- violated the existing constraint, causing every cron invocation to fail.

alter table public.pattern_detections drop constraint if exists pattern_detections_pattern_type_check;
alter table public.pattern_detections add constraint pattern_detections_pattern_type_check
  check (pattern_type in (
    'daily', 'weekly', 'tool_sequence', 'daily_workflow', 'weekly_workflow',
    'trigger_time', 'memory_reflection', 'connection_expiry'
  ));
