-- CreateIndex: order_items.order_id
CREATE INDEX ASYNC IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");
