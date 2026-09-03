-- Keep the newest default address when older data contains duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id"
            ORDER BY "created_at" DESC, "id" DESC
        ) AS row_number
    FROM "addresses"
    WHERE "is_default" = true
)
UPDATE "addresses" AS addresses
SET "is_default" = false
FROM ranked
WHERE addresses."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "addresses_one_default_per_user_idx"
ON "addresses" ("user_id")
WHERE "is_default" = true;
