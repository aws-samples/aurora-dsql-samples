-- CreateTable: order_items
CREATE TABLE IF NOT EXISTS "order_items" (
    "id" UUID DEFAULT gen_random_uuid() NOT NULL,
    "order_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
