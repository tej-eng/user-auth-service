/*
  Warnings:

  - Added the required column `address` to the `AstrologerApplication` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AstrologerApplication" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "pincode" TEXT,
ALTER COLUMN "email" DROP NOT NULL;
