/*
  Warnings:

  - The values [INTERVIEW,DOCUMENT_VERIFICATION] on the enum `ApprovalStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [FAILED,RESCHEDULED] on the enum `InterviewStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `adminId` on the `Astrologer` table. All the data in the column will be lost.
  - You are about to drop the column `approvalStatus` on the `Astrologer` table. All the data in the column will be lost.
  - You are about to drop the column `contactNo` on the `Astrologer` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AstrologerApplication` table. All the data in the column will be lost.
  - You are about to drop the `Interview` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[phoneNumber]` on the table `Astrologer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[applicationId]` on the table `Astrologer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phoneNumber]` on the table `AstrologerApplication` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `AstrologerApplication` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `applicationId` to the `Astrologer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gender` to the `Astrologer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `Astrologer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AstrologerApplication` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `gender` on the `AstrologerApplication` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApprovalStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "Astrologer" ALTER COLUMN "approvalStatus" DROP DEFAULT;
ALTER TABLE "AstrologerApplication" ALTER COLUMN "approvalStatus" TYPE "ApprovalStatus_new" USING ("approvalStatus"::text::"ApprovalStatus_new");
ALTER TYPE "ApprovalStatus" RENAME TO "ApprovalStatus_old";
ALTER TYPE "ApprovalStatus_new" RENAME TO "ApprovalStatus";
DROP TYPE "ApprovalStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "InterviewStatus_new" AS ENUM ('PENDING', 'SCHEDULED', 'PASSED', 'REJECTED');
ALTER TABLE "Interview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AstrologerApplication" ALTER COLUMN "interviewStatus" TYPE "InterviewStatus_new" USING ("interviewStatus"::text::"InterviewStatus_new");
ALTER TYPE "InterviewStatus" RENAME TO "InterviewStatus_old";
ALTER TYPE "InterviewStatus_new" RENAME TO "InterviewStatus";
DROP TYPE "InterviewStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Astrologer" DROP CONSTRAINT "Astrologer_adminId_fkey";

-- DropForeignKey
ALTER TABLE "Astrologer" DROP CONSTRAINT "Astrologer_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_astrologerId_fkey";

-- AlterTable
ALTER TABLE "Astrologer" DROP COLUMN "adminId",
DROP COLUMN "approvalStatus",
DROP COLUMN "contactNo",
ADD COLUMN     "applicationId" TEXT NOT NULL,
ADD COLUMN     "gender" "Gender" NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ALTER COLUMN "profilePic" DROP NOT NULL,
ALTER COLUMN "about" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "rating" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "AstrologerApplication" DROP COLUMN "status",
ADD COLUMN     "applicationStatus" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "interviewDate" TIMESTAMP(3),
ADD COLUMN     "interviewStatus" "InterviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "interviewTime" TEXT,
ADD COLUMN     "interviewerId" TEXT,
ADD COLUMN     "round" INTEGER,
ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender" NOT NULL;

-- DropTable
DROP TABLE "Interview";

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_slug_key" ON "Department"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_staffId_permissionId_key" ON "StaffPermission"("staffId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Astrologer_phoneNumber_key" ON "Astrologer"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Astrologer_applicationId_key" ON "Astrologer"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerApplication_phoneNumber_key" ON "AstrologerApplication"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerApplication_email_key" ON "AstrologerApplication"("email");

-- CreateIndex
CREATE INDEX "AstrologerApplication_applicationStatus_idx" ON "AstrologerApplication"("applicationStatus");

-- CreateIndex
CREATE INDEX "AstrologerApplication_interviewStatus_idx" ON "AstrologerApplication"("interviewStatus");

-- CreateIndex
CREATE INDEX "AstrologerApplication_approvalStatus_idx" ON "AstrologerApplication"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Astrologer" ADD CONSTRAINT "Astrologer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Astrologer" ADD CONSTRAINT "Astrologer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AstrologerApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerApplication" ADD CONSTRAINT "AstrologerApplication_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerApplication" ADD CONSTRAINT "AstrologerApplication_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
