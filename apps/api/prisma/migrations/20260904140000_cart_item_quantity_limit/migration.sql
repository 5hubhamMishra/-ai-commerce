-- Keep repeated cart additions bounded at the database boundary too.
-- NOT VALID avoids blocking deployment on legacy carts created before the API cap;
-- new inserts and updates are still checked immediately.
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_max_check"
  CHECK ("quantity" BETWEEN 1 AND 999)
  NOT VALID;
