-- Two changes that were applied with `db push` during development and never
-- captured as a migration. Without this file a fresh database built by
-- `prisma migrate deploy` would still carry the Ad studio's Creative table
-- and would be missing the Activity -> User foreign key the app relies on.

-- DropForeignKey
ALTER TABLE "Creative" DROP CONSTRAINT "Creative_brandId_fkey";

-- DropForeignKey
ALTER TABLE "Creative" DROP CONSTRAINT "Creative_campaignId_fkey";

-- DropTable
DROP TABLE "Creative";

-- DropEnum
DROP TYPE "CreativeStatus";

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

