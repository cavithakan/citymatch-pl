-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('EARNINGS', 'HOUSING', 'LABOUR', 'SAFETY', 'ENVIRONMENT', 'LIVING');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BENEFIT', 'COST');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('GUS_BDL', 'GIOS', 'OPEN_METEO', 'DERIVED');

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bdlUnitId" TEXT NOT NULL,
    "voivodeship" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "geometry" JSONB NOT NULL,
    "wikipediaTitlePl" TEXT,
    "wikipediaTitleEn" TEXT,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bdlUnitId" TEXT NOT NULL,
    "cityId" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicator" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "bdlVarId" INTEGER,
    "source" "Source" NOT NULL,
    "theme" "Theme" NOT NULL,
    "unit" TEXT NOT NULL,
    "labelPl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "descPl" TEXT,
    "descEn" TEXT,
    "direction" "Direction" NOT NULL,
    "availableAtDistrict" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityIndicator" (
    "cityId" INTEGER NOT NULL,
    "indicatorId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CityIndicator_pkey" PRIMARY KEY ("cityId","indicatorId","year")
);

-- CreateTable
CREATE TABLE "DistrictIndicator" (
    "districtId" INTEGER NOT NULL,
    "indicatorId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DistrictIndicator_pkey" PRIMARY KEY ("districtId","indicatorId","year")
);

-- CreateTable
CREATE TABLE "CityClimate" (
    "cityId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "comfortableDays" INTEGER NOT NULL,
    "sunshineHours" DOUBLE PRECISION NOT NULL,
    "rainyDays" INTEGER NOT NULL,
    "avgTemp" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityClimate_pkey" PRIMARY KEY ("cityId")
);

-- CreateTable
CREATE TABLE "ApiCache" (
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiCache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "City_bdlUnitId_key" ON "City"("bdlUnitId");

-- CreateIndex
CREATE INDEX "City_voivodeship_idx" ON "City"("voivodeship");

-- CreateIndex
CREATE UNIQUE INDEX "District_slug_key" ON "District"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "District_bdlUnitId_key" ON "District"("bdlUnitId");

-- CreateIndex
CREATE INDEX "District_cityId_idx" ON "District"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Indicator_code_key" ON "Indicator"("code");

-- CreateIndex
CREATE INDEX "Indicator_theme_idx" ON "Indicator"("theme");

-- CreateIndex
CREATE INDEX "CityIndicator_indicatorId_year_idx" ON "CityIndicator"("indicatorId", "year");

-- CreateIndex
CREATE INDEX "DistrictIndicator_indicatorId_year_idx" ON "DistrictIndicator"("indicatorId", "year");

-- CreateIndex
CREATE INDEX "ApiCache_provider_idx" ON "ApiCache"("provider");

-- CreateIndex
CREATE INDEX "ApiCache_expiresAt_idx" ON "ApiCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityIndicator" ADD CONSTRAINT "CityIndicator_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityIndicator" ADD CONSTRAINT "CityIndicator_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictIndicator" ADD CONSTRAINT "DistrictIndicator_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictIndicator" ADD CONSTRAINT "DistrictIndicator_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityClimate" ADD CONSTRAINT "CityClimate_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
