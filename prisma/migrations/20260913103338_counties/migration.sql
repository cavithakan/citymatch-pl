-- CreateTable
CREATE TABLE "County" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bdlUnitId" TEXT NOT NULL,
    "voivodeship" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,

    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountyIndicator" (
    "countyId" INTEGER NOT NULL,
    "indicatorId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CountyIndicator_pkey" PRIMARY KEY ("countyId","indicatorId","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "County_slug_key" ON "County"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "County_bdlUnitId_key" ON "County"("bdlUnitId");

-- CreateIndex
CREATE INDEX "County_voivodeship_idx" ON "County"("voivodeship");

-- CreateIndex
CREATE INDEX "CountyIndicator_indicatorId_year_idx" ON "CountyIndicator"("indicatorId", "year");

-- AddForeignKey
ALTER TABLE "CountyIndicator" ADD CONSTRAINT "CountyIndicator_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountyIndicator" ADD CONSTRAINT "CountyIndicator_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
