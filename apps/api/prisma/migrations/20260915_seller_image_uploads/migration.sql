CREATE TABLE "product_image_uploads" (
    "image_id" TEXT NOT NULL PRIMARY KEY,
    "content" BYTEA NOT NULL,
    CONSTRAINT "product_image_uploads_image_id_fkey" FOREIGN KEY ("image_id")
      REFERENCES "product_images"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_image_uploads_size" CHECK (octet_length("content") <= 2097152)
);
