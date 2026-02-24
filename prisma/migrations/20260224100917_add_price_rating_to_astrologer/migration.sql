-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "refreshToken" TEXT;

-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "price" INTEGER DEFAULT 0,
ADD COLUMN     "rating" DOUBLE PRECISION DEFAULT 0;

-- CreateIndex
CREATE INDEX "Astrologer_approvalStatus_idx" ON "Astrologer"("approvalStatus");

-- CreateIndex
CREATE INDEX "Astrologer_price_idx" ON "Astrologer"("price");

-- CreateIndex
CREATE INDEX "Astrologer_rating_idx" ON "Astrologer"("rating");

-- CreateIndex
CREATE INDEX "Astrologer_experience_idx" ON "Astrologer"("experience");
