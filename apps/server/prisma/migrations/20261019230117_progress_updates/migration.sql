-- CreateTable
CREATE TABLE "progress_updates" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "task_id" UUID,
    "text_technical" TEXT NOT NULL,
    "text_plain" TEXT,
    "blockers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_by_owner_at" TIMESTAMP(3),

    CONSTRAINT "progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_updates_read_by_owner_at_created_at_idx" ON "progress_updates"("read_by_owner_at", "created_at");

-- CreateIndex
CREATE INDEX "progress_updates_employee_id_created_at_idx" ON "progress_updates"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "progress_updates_created_at_idx" ON "progress_updates"("created_at");

-- AddForeignKey
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
