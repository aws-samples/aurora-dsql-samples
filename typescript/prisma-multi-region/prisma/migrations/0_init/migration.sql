-- CreateTable
CREATE TABLE IF NOT EXISTS "orders" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL,
    "product" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "region" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "order_items" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL,
    "order_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX ASYNC IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");
