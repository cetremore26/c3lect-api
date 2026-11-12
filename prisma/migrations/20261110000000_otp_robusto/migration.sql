-- CreateEnum
CREATE TYPE "PropositoOtp" AS ENUM ('LOGIN', 'ADMIN_2FA');

-- AlterTable
ALTER TABLE "otp_codes" ADD COLUMN "intentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "proposito" "PropositoOtp" NOT NULL DEFAULT 'LOGIN';

-- CreateIndex
CREATE INDEX "otp_codes_email_proposito_created_at_idx" ON "otp_codes"("email", "proposito", "created_at");
