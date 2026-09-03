-- Keep the newest default variant when older data contains duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "product_id"
            ORDER BY "created_at" DESC, "id" DESC
        ) AS row_number
    FROM "product_variants"
    WHERE "is_default" = true
)
UPDATE "product_variants" AS variants
SET "is_default" = false
FROM ranked
WHERE variants."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "product_variants_one_default_per_product_idx"
ON "product_variants" ("product_id")
WHERE "is_default" = true;
