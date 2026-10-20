-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('IDLE', 'SECURITY');

-- CreateEnum
CREATE TYPE "IdleReason" AS ENUM ('NO_ACTIVITY', 'NO_FACE', 'FACE_MISMATCH', 'CAMERA_UNAVAILABLE');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "user_id" UUID,
    "idle_reason" "IdleReason",
    "score" DOUBLE PRECISION,
    "security_kind" TEXT,
    "message" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "employee_ack_at" TIMESTAMP(3),
    "owner_ack_at" TIMESTAMP(3),
    "owner_ack_by" UUID,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_owner_ack_at_at_idx" ON "alerts"("owner_ack_at", "at");

-- CreateIndex
CREATE INDEX "alerts_user_id_at_idx" ON "alerts"("user_id", "at");

-- CreateIndex
CREATE INDEX "alerts_at_idx" ON "alerts"("at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_owner_ack_by_fkey" FOREIGN KEY ("owner_ack_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
