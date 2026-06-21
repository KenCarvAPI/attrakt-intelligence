-- Discourse ingestion event types. Topic/post creation and accepted-solution
-- are distinct community signals; governance participation is flagged in
-- Event.eventData (eventData->>'governance') rather than via a separate type.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DISCOURSE_TOPIC_CREATED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DISCOURSE_POST_CREATED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DISCOURSE_SOLUTION_ACCEPTED';
