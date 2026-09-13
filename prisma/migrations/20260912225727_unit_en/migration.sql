-- Add the English unit column.
--
-- The table already holds 27 indicators, so the column cannot simply be
-- declared NOT NULL. It is added with a temporary default, backfilled from the
-- Polish unit so nothing renders empty in the moment between migrating and
-- reseeding, and the default is then dropped: the catalogue is the only thing
-- allowed to decide what a unit says.
ALTER TABLE "Indicator" ADD COLUMN "unitEn" TEXT NOT NULL DEFAULT '';
UPDATE "Indicator" SET "unitEn" = "unit" WHERE "unitEn" = '';
ALTER TABLE "Indicator" ALTER COLUMN "unitEn" DROP DEFAULT;
