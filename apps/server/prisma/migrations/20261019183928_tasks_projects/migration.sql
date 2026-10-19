-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('AI_BREAKDOWN', 'MANUAL', 'DIRECT');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "brief_original" TEXT,
    "summary_technical" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "description_technical" TEXT NOT NULL,
    "description_original" TEXT,
    "job_role_id" UUID,
    "assignee_id" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TaskPriority" NOT NULL,
    "source" "TaskSource" NOT NULL,
    "blocked_reason" TEXT,
    "created_by" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus" NOT NULL,
    "by_user_id" UUID NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "task_status_events_task_id_at_idx" ON "task_status_events"("task_id", "at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_role_id_fkey" FOREIGN KEY ("job_role_id") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_events" ADD CONSTRAINT "task_status_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_events" ADD CONSTRAINT "task_status_events_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
