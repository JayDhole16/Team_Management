-- AlterTable
ALTER TABLE "progress_updates" ADD COLUMN     "preview_mac" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "progress_updates_preview_mac_key" ON "progress_updates"("preview_mac");
