-- Keep impossible commerce values out even when a write bypasses the API.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_nonnegative_check"
  CHECK ("price" >= 0),
  ADD CONSTRAINT "product_variants_compare_at_price_nonnegative_check"
  CHECK ("compare_at_price" IS NULL OR "compare_at_price" >= 0),
  ADD CONSTRAINT "product_variants_weight_nonnegative_check"
  CHECK ("weight_grams" IS NULL OR "weight_grams" >= 0);

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantities_nonnegative_check"
  CHECK (
    "quantity_on_hand" >= 0 AND
    "quantity_reserved" >= 0 AND
    "quantity_committed" >= 0 AND
    "quantity_damaged" >= 0 AND
    "quantity_incoming" >= 0 AND
    "reorder_point" >= 0
  ),
  ADD CONSTRAINT "inventory_allocated_not_above_on_hand_check"
  CHECK ("quantity_reserved" + "quantity_committed" <= "quantity_on_hand");

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_nonnegative_check"
  CHECK (
    "subtotal" >= 0 AND
    "shipping_fee" >= 0 AND
    "discount_total" >= 0 AND
    "tax_total" >= 0 AND
    "total" >= 0
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_amounts_valid_check"
  CHECK ("unit_price" >= 0 AND "line_total" >= 0 AND "quantity" > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive_check"
  CHECK ("amount" > 0);

ALTER TABLE "return_request_items"
  ADD CONSTRAINT "return_request_items_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive_check"
  CHECK ("amount" > 0);

ALTER TABLE "replacement_items"
  ADD CONSTRAINT "replacement_items_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "exchanges"
  ADD CONSTRAINT "exchanges_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_rating_range_check"
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "sellers"
  ADD CONSTRAINT "sellers_commission_rate_bps_range_check"
  CHECK ("commission_rate_bps" BETWEEN 0 AND 10000);

ALTER TABLE "seller_earnings"
  ADD CONSTRAINT "seller_earnings_amounts_nonnegative_check"
  CHECK ("gross_amount" >= 0 AND "commission_amount" >= 0 AND "net_amount" >= 0),
  ADD CONSTRAINT "seller_earnings_commission_rate_bps_range_check"
  CHECK ("commission_rate_bps" BETWEEN 0 AND 10000);

ALTER TABLE "seller_payouts"
  ADD CONSTRAINT "seller_payouts_amount_positive_check"
  CHECK ("amount" > 0);
