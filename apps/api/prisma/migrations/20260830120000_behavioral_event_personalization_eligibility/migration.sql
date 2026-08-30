ALTER TABLE "behavioral_events"
ADD COLUMN "personalization_eligible" BOOLEAN NOT NULL DEFAULT true;

UPDATE "behavioral_events" AS events
SET "personalization_eligible" = false
FROM "profiles" AS profiles
WHERE events."user_id" = profiles."user_id"
  AND profiles."personalization_enabled" = false;

CREATE INDEX "behavioral_events_user_id_personalization_eligible_occurred_at_idx"
ON "behavioral_events"("user_id", "personalization_eligible", "occurred_at");
