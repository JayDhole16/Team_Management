-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('MANUAL_STOP', 'AUTO_CLOSED', 'LOGOUT', 'DEACTIVATED', 'MAX_DURATION');

-- CreateEnum
CREATE TYPE "HeartbeatState" AS ENUM ('ACTIVE', 'IDLE', 'AWAY');

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "end_reason" "SessionEndReason",
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heartbeats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "state" "HeartbeatState" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_session_gaps" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "from_at" TIMESTAMP(3) NOT NULL,
    "to_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_session_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_sessions_user_id_started_at_idx" ON "work_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "work_sessions_ended_at_last_heartbeat_at_idx" ON "work_sessions"("ended_at", "last_heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_one_open_per_user" ON "work_sessions"("user_id") WHERE (ended_at IS NULL);

-- CreateIndex
CREATE INDEX "heartbeats_session_id_at_idx" ON "heartbeats"("session_id", "at");

-- CreateIndex
CREATE INDEX "heartbeats_at_idx" ON "heartbeats"("at");

-- CreateIndex
CREATE INDEX "work_session_gaps_session_id_idx" ON "work_session_gaps"("session_id");

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_session_gaps" ADD CONSTRAINT "work_session_gaps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
