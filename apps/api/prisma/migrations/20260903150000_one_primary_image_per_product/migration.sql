-- Keep the newest primary image when older data contains duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "product_id"
            ORDER BY "created_at" DESC, "id" DESC
        ) AS row_number
    FROM "product_images"
    WHERE "is_primary" = true
)
UPDATE "product_images" AS images
SET "is_primary" = false
FROM ranked
WHERE images."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "product_images_one_primary_per_product_idx"
ON "product_images" ("product_id")
WHERE "is_primary" = true;
