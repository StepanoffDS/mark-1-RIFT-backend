CREATE TYPE incident_event_type AS ENUM (
  'INCIDENT_CREATED',
  'INCIDENT_UPDATED',
  'STATUS_CHANGED',
  'SEVERITY_CHANGED',
  'USER_ASSIGNED',
  'USER_UNASSIGNED',
  'INCIDENT_RESOLVED',
  'INCIDENT_REOPENED'
);

CREATE TABLE incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  type incident_event_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX incident_events_timeline_idx
  ON incident_events(incident_id, created_at DESC);
