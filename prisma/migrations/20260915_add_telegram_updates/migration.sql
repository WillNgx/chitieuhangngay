CREATE TABLE "telegram_updates" (
    "update_id" BIGINT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("update_id")
);
