CREATE TABLE "CustomerEmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAllowedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerEmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerEmailVerification_email_key"
ON "CustomerEmailVerification"("email");

CREATE INDEX "CustomerEmailVerification_expiresAt_idx"
ON "CustomerEmailVerification"("expiresAt");
