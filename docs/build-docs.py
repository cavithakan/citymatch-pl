"""
Builds the diploma documentation as a .docx, following the supplied template.

The generated file is committed alongside this script, so nobody needs to run
it. It is kept because of what it guarantees: every code excerpt in the
document is read out of the working tree by line number at build time rather
than retyped, so the documentation cannot quietly drift away from the code it
describes. Re-run it after changing any quoted file and the excerpts follow.

    pip install python-docx Pillow
    python3 docs/build-docs.py
"""
import pathlib, textwrap
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.section import WD_SECTION
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "CityMatch-PL-documentation.docx"
ACCESSED = "13.09.2026"
MAX_FIGURE_WIDTH_CM = 15.5
MAX_FIGURE_HEIGHT_CM = 7.2

STUDENT = "Ata Kılıç"
INDEX = "[INDEX NUMBER]"
SUPERVISOR = "[SUPERVISOR]"
TITLE = "CityMatch PL: a relocation guide to Polish cities built on official open data"


def src(path, start, end):
    body = "\n".join((ROOT / path).read_text().split("\n")[start - 1:end])
    return textwrap.dedent(body).strip("\n")


CODE = {
    # Lines 129-130 and 132-137: the comment on line 131 is skipped so the
    # excerpt stays quotable without altering the source it is quoting.
    "throttle": src("src/lib/providers/bdl.ts", 129, 130) + "\n"
                + src("src/lib/providers/bdl.ts", 132, 137),
    "paging": src("scripts/refresh-data.ts", 132, 134),
    "unitkey": src("scripts/fetch-geometry.ts", 80, 83),
    "projection": src("src/lib/geo/projection.ts", 72, 82),
    "quantile": src("src/components/map/poland-map.tsx", 492, 500),
    "normalize": src("src/lib/scoring/normalize.ts", 25, 39),
    "ease": src("src/lib/ease.ts", 22, 24),
    "nonindexed": src("src/components/map/county-fills.tsx", 238, 240),
}

CAPTIONS = [
    ("01-map.png", "Figure 1. The opening view. All 380 Polish counties are coloured by average "
     "gross monthly salary on one scale; the 66 cities carry a dot, a name and a coat of arms."),
    ("03-map-affordability.png", "Figure 2. The same country measured by months of local salary "
     "per square metre, a figure no single published series contains."),
    ("04-map-air.png", "Figure 3. Air quality. Counties are drawn in flat grey because the measure "
     "comes from a GIOS station and most rural counties have none."),
    ("02-city-panel.png", "Figure 4. Selecting a city opens a panel over the map rather than "
     "navigating away, so the country stays on screen."),
    ("05-city-page.png", "Figure 5. The full city profile, for linking and printing."),
    ("06-city-indicators.png", "Figure 6. Indicator rows with rank gauge, deviation from the "
     "national median and ten years of history."),
    ("07-warsaw-districts.png", "Figure 7. Warsaw district breakdown. The nine indicators the "
     "Local Data Bank does not publish per district are named rather than hidden."),
    ("08-compare.png", "Figure 8. Weighted comparison with the contribution of each theme shown "
     "separately."),
    ("09-about.png", "Figure 9. Sources, method and limits, including the emblem licences that "
     "require attribution."),
    ("10-cache.png", "Figure 10. The response cache inspector, showing provider, freshness and "
     "hit counts."),
    ("11-mobile.png", "Figure 11. On a phone the map fills the viewport and the panels become "
     "sheets."),
]

BIBLIOGRAPHY = [
    ("Statistics Poland (GUS). Local Data Bank API, version 1. "
     "https://bdl.stat.gov.pl/api/v1 (accessed %s)." % ACCESSED),
    ("Statistics Poland (GUS). Local Data Bank, web interface. "
     "https://bdl.stat.gov.pl/bdl/start (accessed %s)." % ACCESSED),
    ("Chief Inspectorate of Environmental Protection (GIOS). Air quality API. "
     "https://api.gios.gov.pl/pjp-api/swagger-ui/ (accessed %s)." % ACCESSED),
    ("Institute of Meteorology and Water Management (IMGW). Public data service. "
     "https://danepubliczne.imgw.pl/apiinfo (accessed %s)." % ACCESSED),
    ("Open-Meteo. Historical Weather API documentation. "
     "https://open-meteo.com/en/docs/historical-weather-api (accessed %s)." % ACCESSED),
    ("National Bank of Poland (NBP). Exchange rates API. "
     "https://api.nbp.pl/ (accessed %s)." % ACCESSED),
    ("Wikidata. Property P94, coat of arms image. "
     "https://www.wikidata.org/wiki/Property:P94 (accessed %s)." % ACCESSED),
    ("Wikimedia Commons. MediaWiki Action API, imageinfo module. "
     "https://commons.wikimedia.org/w/api.php (accessed %s)." % ACCESSED),
    ("OpenStreetMap Foundation. Nominatim usage policy. "
     "https://operations.osmfoundation.org/policies/nominatim/ (accessed %s)." % ACCESSED),
    ("Patrzyk, P. polska-geojson: administrative boundaries of Poland as GeoJSON. "
     "https://github.com/ppatrzyk/polska-geojson (accessed %s)." % ACCESSED),
    ("Butler, H., Daly, M., Doyle, A., Gillies, S., Hagen, S., Schaub, T. (2016). "
     "RFC 7946: The GeoJSON Format. Internet Engineering Task Force. "
     "https://datatracker.ietf.org/doc/html/rfc7946 (accessed %s)." % ACCESSED),
    ("Douglas, D. H., Peucker, T. K. (1973). Algorithms for the reduction of the number of "
     "points required to represent a digitized line or its caricature. "
     "Cartographica 10(2), pp. 112-122."),
    ("Fishburn, P. C. (1967). Additive Utilities with Incomplete Product Sets: Application to "
     "Priorities and Assignments. Operations Research 15(3), pp. 537-542."),
    ("Hwang, C.-L., Yoon, K. (1981). Multiple Attribute Decision Making: Methods and "
     "Applications. Lecture Notes in Economics and Mathematical Systems, vol. 186. "
     "Springer-Verlag, Berlin."),
    ("Slocum, T. A., McMaster, R. B., Kessler, F. C., Howard, H. H. (2009). Thematic "
     "Cartography and Geovisualization, 3rd edition. Pearson Prentice Hall."),
    ("Brewer, C. A. ColorBrewer: colour advice for cartography. "
     "https://colorbrewer2.org (accessed %s)." % ACCESSED),
    ("Vercel. Next.js documentation, App Router. "
     "https://nextjs.org/docs (accessed %s)." % ACCESSED),
    ("Three.js. Documentation and manual. "
     "https://threejs.org/docs/ (accessed %s)." % ACCESSED),
    ("Poimandres. React Three Fiber documentation. "
     "https://r3f.docs.pmnd.rs/ (accessed %s)." % ACCESSED),
    ("Bostock, M. d3-geo: geographic projections and spherical shapes. "
     "https://d3js.org/d3-geo (accessed %s)." % ACCESSED),
    ("Prisma. Prisma ORM documentation, driver adapters. "
     "https://www.prisma.io/docs (accessed %s)." % ACCESSED),
    ("Amann, J. next-intl: internationalisation for Next.js. "
     "https://next-intl.dev (accessed %s)." % ACCESSED),
    ("Numbeo. Cost of living methodology. "
     "https://www.numbeo.com/cost-of-living/cpi_explained.jsp (accessed %s)." % ACCESSED),
]


# --------------------------------------------------------------------------
# Document helpers
# --------------------------------------------------------------------------

def setup(doc):
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.15
    for section in doc.sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)


def para(doc, text, size=11, bold=False, align=None, after=6, italic=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(after)
    return p


def heading(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = "Times New Roman"
    run.font.size = Pt(16)
    run.bold = True
    run.font.color.rgb = RGBColor(0x1F, 0x3B, 0x57)
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(10)
    return p


def subheading(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(12)
    run.bold = True
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    return p


def code(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.left_indent = Cm(0.6)
    return p


def bullets(doc, items, size=11):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        run = p.add_run(item)
        run.font.size = Pt(size)
        p.paragraph_format.space_after = Pt(3)


def caption(doc, text):
    para(doc, text, size=9, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=14)


def row(table, label, blocks):
    """One template row: a label on the left, one or more paragraphs on the right."""
    cells = table.add_row().cells
    cells[0].width = Cm(4.2)
    cells[1].width = Cm(11.8)
    p = cells[0].paragraphs[0]
    run = p.add_run(label)
    run.bold = True
    run.font.size = Pt(10)
    first = True
    for block in blocks:
        target = cells[1].paragraphs[0] if first else cells[1].add_paragraph()
        run = target.add_run(block)
        run.font.size = Pt(10)
        target.paragraph_format.space_after = Pt(5)
        first = False


# --------------------------------------------------------------------------
# Title page and section 1
# --------------------------------------------------------------------------

def title_page(doc):
    para(doc, "BRANCH OF STUDY: COMPUTER SCIENCE", size=12, bold=True,
         align=WD_ALIGN_PARAGRAPH.CENTER, after=60)
    para(doc, STUDENT, size=13, align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
    para(doc, "full-time course", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
    para(doc, "index number %s" % INDEX, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, after=90)
    para(doc, TITLE, size=18, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=70)
    para(doc, "Documentation for the diploma project prepared under the supervision of %s"
         % SUPERVISOR, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, after=110)
    para(doc, "Warsaw, 2026", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, after=0)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def basic_information(doc):
    heading(doc, "1. Basic information")
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"

    row(table, "Project name", [
        "CityMatch PL: a relocation guide to Polish cities built on official open data.",
    ])

    row(table, "Project goal", [
        "Somebody moving to Poland, or a Pole changing city, has to assemble the figures that "
        "decide the move from institutions that do not talk to each other. Salaries, flat "
        "prices, unemployment and crime come from Statistics Poland, air quality from the Chief "
        "Inspectorate of Environmental Protection, current weather from the Institute of "
        "Meteorology and Water Management, exchange rates from the National Bank of Poland. The "
        "series are published in different units, for different reference years, under numeric "
        "variable identifiers, and in practice only in Polish. Nothing joins them, so the "
        "comparison has to be assembled by hand in a spreadsheet, and for most people it is "
        "simply never made.",

        "This project joins those sources into a single data model and puts the result on one "
        "map. It covers the 66 Polish towns that hold county rights, which is the administrative "
        "level at which labour market and housing statistics are published, and it draws them "
        "against all 380 Polish counties so that a city's figure can be read against the country "
        "rather than against a shortlist of other cities. The people it is for are foreigners "
        "choosing where in Poland to settle and Poles considering a move between cities.",
    ])

    row(table, "Brief description of the project", [
        "A bilingual single page web application. The map fills the viewport and every control "
        "floats above it: the measure is chosen on the left, the ranking sits on the right, and "
        "opening a place slides a panel over the country instead of navigating away, so the "
        "reader never loses the view they were reading.",

        "The database holds 27 indicators in six themes (earnings, housing, labour market, "
        "safety, environment, climate and living) for 66 cities, 314 land counties and the 18 "
        "districts of Warsaw, covering reference years 2017 to 2026. Four of the indicators are "
        "derived by combining two published series, among them the number of months of local "
        "salary a square metre of housing costs. Each place has a full profile page with the "
        "rank, the deviation from the national median and ten years of history per indicator. A "
        "separate comparison view lets the reader weight the six themes and re-rank the cities "
        "accordingly, with the contribution of each theme shown separately.",

        "No API key is required by any part of the system, which means a fresh clone reaches a "
        "working site with nothing but a PostgreSQL connection string.",
    ])

    row(table, "Competitor product analysis", [
        "Numbeo is the best known cost of living comparison site and covers Polish cities. Its "
        "strengths are coverage and freshness. Its weakness is fundamental to this use case: "
        "every figure is contributed by self-selected users, so a Polish city entry can rest on "
        "a handful of respondents, and there is no way to tell how many. It answers what a small "
        "group of visitors reported, not what is true of the city.",

        "Nomad List curates city profiles for remote workers and aggregates a wide range of "
        "signals. It is a paid, globally scoped product; its Polish coverage is thin, the "
        "underlying figures are not traceable to a named institution, and its ranking weights "
        "are fixed by the publisher rather than by the reader.",

        "The Local Data Bank operated by Statistics Poland is the authoritative source and is "
        "free, so it is the real incumbent. It is, however, a statistical table browser rather "
        "than a guide. Using it requires knowing which of several thousand numbered variables to "
        "request and at which unit level, the interface is Polish in practice, and it does "
        "neither comparison nor ranking. It will not tell anybody what a square metre costs in "
        "months of local pay, because that figure exists in no single published series.",

        "Commercial property portals publish housing price indices for Polish cities. These "
        "cover one theme only, are derived from the portal's own listings rather than from "
        "transactions, and their methodology is not published.",

        "This project differs from all of them on four points: every figure is traceable to the "
        "institution named beside it, the interface and the indicator labels exist in both "
        "Polish and English, the derived metrics cross sources that none of the competitors "
        "join, and the weighting of the comparison belongs to the reader rather than to the "
        "publisher.",
    ])

    row(table, "List of technologies used", [
        "Next.js 16.3.5 (App Router, React Server Components, Turbopack)",
        "React 19.2.8 and TypeScript 5",
        "Three.js 0.186 with React Three Fiber 9.7 and Drei 10.7, for the map",
        "d3-geo 3.1, for the Mercator projection",
        "PostgreSQL 15 with Prisma ORM 7.10 and the @prisma/adapter-pg driver adapter",
        "Tailwind CSS 4",
        "next-intl 4.14, for Polish and English routing and message catalogues",
        "Recharts 3.10, for the time series and radar charts",
        "Vitest 5, for the unit tests; Playwright 1.63, for screenshots and interaction probes",
        "Node.js 22 and tsx, for the data pipeline scripts",
    ])

    row(table, "Description of the technological stack and justification of selected technologies", [
        "The stack has three layers that meet in the database. A set of Node scripts collects "
        "data from five public APIs and writes it to PostgreSQL through Prisma; this happens "
        "offline and never during a page request. Next.js server components read from the same "
        "database and send a complete data set to the browser with the page. The map renders "
        "that data with Three.js and needs no further network access, so changing the measure "
        "repaints the country immediately instead of making a round trip.",

        "Next.js was chosen because the map has to be fast to open and indexable, and server "
        "components give both without a separate API layer: the 66 cities and 314 counties by "
        "roughly two dozen figures each are a few thousand numbers, small enough to send once. "
        "Three.js was chosen over a two dimensional mapping library because selection is "
        "expressed by raising a place out of the plane, which a flat renderer cannot do, and "
        "because the same scene serves both the country map and the Warsaw district map. "
        "PostgreSQL and Prisma were chosen for the indicator catalogue: keeping indicator "
        "definitions in a table rather than in code means adding a measure is one insert and a "
        "refresh run, with no change in the scoring or rendering layers. Prisma 7 requires an "
        "explicit driver adapter, which is why @prisma/adapter-pg appears in the dependency "
        "list. next-intl was chosen because the labels and units are themselves data: Statistics "
        "Poland publishes units as Polish phrases, so every indicator carries both a Polish and "
        "an English unit string rather than leaving Polish inside an English figure.",
    ])

    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# --------------------------------------------------------------------------
# Section 2: key implementation issues
# --------------------------------------------------------------------------

def key_issues(doc):
    heading(doc, "2. Key issues related to the implementation of the project")

    para(doc, "The seven problems below were the ones that decided how the project is built. "
              "Each is presented with the code that resolves it.")

    subheading(doc, "2.1 Collecting bulk statistics from an API that refuses with HTTP 200")
    para(doc,
         "The Local Data Bank exposes a bulk endpoint, /data/by-variable, which returns one "
         "variable for every administrative unit at a chosen level in a single request. Using it "
         "turns what would be 66 requests per indicator into four, and it is the reason a full "
         "refresh of 27 indicators takes minutes rather than hours. Discovering it also decided "
         "the shape of the whole pipeline: data is collected offline into PostgreSQL, and the "
         "web application never calls Statistics Poland during a page request.")
    para(doc,
         "Anonymous use of the API is limited to 100 requests per 15 minutes and 1,000 per 12 "
         "hours. The difficulty is that a refusal does not arrive as HTTP 429. The server answers "
         "with status 200 and a JSON body containing an errorResult field, so a client that "
         "checks only the status code treats a refusal as data and writes nothing while "
         "reporting success. The client therefore inspects the body, and distinguishes a "
         "throttle from a genuine error by its message:")
    code(doc, CODE["throttle"])
    para(doc,
         "Requests are queued 11 seconds apart rather than 9. At 9 seconds a run of 94 requests "
         "fits inside the window at the start but collides with its own tail as the window "
         "slides, which showed up as a throttle two thirds of the way through a run that had "
         "been calculated to fit. Transport failures are retried as well, on a much shorter "
         "backoff than the throttle: a refusal is the server asking for a pause, whereas a "
         "dropped TCP connection is usually a moment of noise. This was added after a single "
         "connect timeout killed a refresh with fourteen of eighteen indicators loaded.")

    subheading(doc, "2.2 A pagination loop that never terminated")
    para(doc,
         "The same endpoint reports totalRecords but omits pageSize, although pageSize does "
         "appear on /units/search, which makes the omission easy to miss. Paging on the value "
         "the response reports produces (page + 1) * undefined, which is NaN, and a comparison "
         "against NaN is false forever. The loop never ended and the script paged silently, at "
         "one request every 11 seconds, until it was killed. The fix is to page on the size that "
         "was requested and to stop on an empty result as well:")
    code(doc, CODE["paging"])

    subheading(doc, "2.3 Joining boundary geometry to statistical units")
    para(doc,
         "The map needs polygons and the statistics come with unit identifiers, and the two "
         "arrive from different publishers with nothing in common but a name. Matching on name "
         "alone is wrong in a way that is silent: ten Polish county names occur twice, so there "
         "is a powiat grodziski in Mazovia and another in Greater Poland. A name match gives "
         "twenty counties each other's statistics, which is worse than having none, because "
         "nothing on the screen indicates a problem.")
    para(doc,
         "Every Local Data Bank unit identifier carries the TERYT code of its voivodeship at the "
         "third and fourth digit. That was verified against the 66 cities, where both the unit "
         "identifier and the voivodeship were already known, and all sixteen prefixes map "
         "without ambiguity. The voivodeship of each boundary polygon is determined by a "
         "point in polygon test of its centroid, and the join key becomes name plus voivodeship. "
         "Two further complications are handled in the same function: the Bank keeps superseded "
         "units alongside their replacements and distinguishes them with a trailing time "
         "qualifier, and one county was renamed in 2021, so the boundary file and the statistical "
         "office disagree about what it is called.")
    code(doc, CODE["unitkey"])

    subheading(doc, "2.4 Projecting geography into a three dimensional scene")
    para(doc,
         "Boundaries arrive as longitude and latitude and have to become flat shapes in the "
         "scene. d3-geo provides the Mercator projection and a fitSize helper that scales a "
         "projection to a given box. Passing the polygons themselves to fitSize produced a "
         "Poland 2.8 units wide inside a 100 unit box.")
    para(doc,
         "The cause is a disagreement about winding order. d3-geo reads a polygon as a region on "
         "a sphere and expects its exterior ring to wind clockwise; RFC 7946, which the source "
         "data follows, specifies counter-clockwise. Given a counter-clockwise ring, d3 concludes "
         "that the polygon is the entire globe except Poland, measures that, and scales "
         "accordingly. Points carry no winding at all, so the fit is computed from the four "
         "corners of the bounding box instead. Mercator is monotonic in longitude and in "
         "latitude independently, which is what makes those corners a correct bound:")
    code(doc, CODE["projection"])

    subheading(doc, "2.5 Drawing 380 polygons at an interactive frame rate")
    para(doc,
         "Drawing each county as its own mesh costs one draw call each and put the map at seven "
         "frames per second. All 314 county outlines are therefore triangulated once and "
         "concatenated into a single buffer with a per-vertex colour attribute, which the render "
         "loop writes into directly. Picking still works per county through a table that maps "
         "each triangle back to the county it came from.")
    para(doc,
         "Two details in that merge are easy to get wrong and both were. ShapeGeometry returns "
         "an indexed geometry, so concatenating its position attribute and discarding the "
         "indices joins whichever vertices happen to land next to each other and draws long "
         "triangles across the country; the geometry has to be expanded to plain triangles "
         "first. And the triangle table cannot be a 16 bit array, because 314 counties at this "
         "resolution produce far more than the 65,535 faces such an array can address, and an "
         "overflow points a click at the wrong county without any visible sign.")
    code(doc, CODE["nonindexed"])

    subheading(doc, "2.6 Classifying the map, and refusing to guess at missing data")
    para(doc,
         "A choropleth needs a rule that turns a value into a colour. A linear ramp between the "
         "minimum and the maximum is the obvious choice and it fails here: fifty of the sixty-six "
         "cities earn between 8,500 and 10,500 zloty while two outliers drag the top of the "
         "scale away, so almost the whole country is painted the same middling colour and every "
         "difference that matters disappears. The values are therefore ranked and spaced evenly, "
         "which is equal count or quantile classification, the standard treatment for clustered "
         "data in thematic cartography. Cities and counties are ranked together on one scale, "
         "because a map on which two units with the same figure are different colours is not a "
         "map of anything:")
    code(doc, CODE["quantile"])
    para(doc,
         "Missing data is treated as a separate category rather than as a low value. Two cases "
         "arise. The Local Data Bank does not omit a series it has not yet published; it returns "
         "the row with a value of zero, so a naive reading of the latest year reports a living "
         "area of 0.0 square metres per person, and worse, ranks a town with no cinema best on "
         "inhabitants per cinema seat, because zero is the smallest number. Each indicator "
         "therefore carries a flag saying whether zero is a real observation, which for net "
         "migration it is. The second case is structural: air quality comes from a measuring "
         "station and the climate figures from a coordinate, and counties have neither, so those "
         "five measures are drawn in a flat grey that sits off the colour scale entirely, and "
         "cities without a figure are drawn as a hollow ring rather than a grey disc, because "
         "grey sits one shade from the cold end of the ramp.")

    subheading(doc, "2.7 The weighted comparison, and motion that survives a slow frame")
    para(doc,
         "The comparison view implements Simple Additive Weighting. Each indicator is rescaled "
         "onto 0 to 100 against the set being compared, with the direction set per indicator so "
         "that a high salary scores well and a high flat price does not. Indicators are averaged "
         "within their theme and the six themes are combined with the weights the reader "
         "chooses. Because the scale is relative to the set, the same city scores differently in "
         "different comparisons, which the interface states. A single city, or a set in which "
         "every value is identical, has no spread to normalise against and returns a neutral 50 "
         "rather than dividing by zero:")
    code(doc, CODE["normalize"])
    para(doc,
         "Transitions between two measures are eased rather than switched. The usual exponential "
         "approach is written to look the same at 30 and at 144 frames per second by scaling "
         "with the frame delta, and that property breaks for a reason unrelated to the display: "
         "changing the measure re-renders three hundred counties and blocks the main thread for "
         "a few hundred milliseconds, and the first frame afterwards carries the whole pause as "
         "its delta. The formula then advances the transition almost to completion in one step, "
         "so the new colours appear rather than arrive. Measuring the colour frame by frame "
         "showed a single step covering 85 per cent of the distance. Clamping the delta to one "
         "frame at 30 frames per second fixes it, and the transition now runs slightly slow "
         "through a stutter instead of skipping it:")
    code(doc, CODE["ease"])

    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# --------------------------------------------------------------------------
# Sections 3 to 5
# --------------------------------------------------------------------------

def screenshots(doc):
    heading(doc, "3. Screenshots")
    for name, text in CAPTIONS:
        path = ROOT / "screenshots" / name
        if not path.exists():
            continue
        # Sized by aspect, not by a fixed width. The captures range from a
        # 3.05 wide indicator strip to a 0.46 phone screen, so one width gives
        # heights between 5 cm and 34 cm and pushes the section past the five
        # page limit. Capping the height instead keeps roughly three figures to
        # a page whatever their shape.
        ratio = Image.open(path).size[0] / Image.open(path).size[1]
        width_cm = min(MAX_FIGURE_WIDTH_CM, MAX_FIGURE_HEIGHT_CM * ratio)
        doc.add_picture(str(path), width=Cm(width_cm))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption(doc, text)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def conclusions(doc):
    heading(doc, "4. Conclusions and development prospects")
    para(doc,
         "The goal was met. Figures from five public institutions are joined in one data model "
         "and presented on one map in two languages, with every number traceable to the body "
         "that published it and no API key required anywhere in the system. The database holds "
         "27 indicators for 66 cities, 314 counties and the 18 districts of Warsaw across "
         "reference years 2017 to 2026. The derived metrics do the thing that motivated the "
         "project: average gross pay in Warsaw is the second highest in the country and its "
         "housing the most expensive, so a square metre costs 1.48 months of local salary there "
         "against 1.26 in Wroclaw, and neither published series says that on its own.")
    para(doc,
         "Three limits are worth stating plainly, and the application states them to the reader "
         "rather than hiding them. Nine indicators stop at the city boundary and are not "
         "published per district, so the Warsaw breakdown names them as absent instead of "
         "leaving gaps. Hospital beds, clinics and nurseries are published per municipality "
         "rather than per county and are therefore outside the scope entirely. Air quality and "
         "the three climate figures depend on a measuring station or a coordinate, which "
         "counties do not have, so those five measures cover the cities only.")
    para(doc,
         "Four directions would extend the work. Climate figures could be computed for counties "
         "from the centroid of each polygon, which would close four of the five gaps above at "
         "the cost of roughly three hundred additional archive requests. The district layer "
         "currently exists for Warsaw alone, because Warsaw is the only Polish city whose "
         "districts appear in the Local Data Bank; adding others would require a different "
         "source. The comparison engine uses Simple Additive Weighting, and a project of this "
         "shape is a reasonable place to compare that method against TOPSIS on the same data. "
         "Finally, every figure carries a reference year, so the time series already in the "
         "database would support showing direction of travel rather than a single snapshot, "
         "which for a relocation decision may matter more than the current value.")
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def bibliography(doc):
    heading(doc, "5. Bibliography and sources")
    para(doc, "Access dates are given in dd.mm.yyyy format.", size=10, italic=True, after=10)
    for i, entry in enumerate(BIBLIOGRAPHY, start=1):
        p = doc.add_paragraph()
        run = p.add_run("%d. %s" % (i, entry))
        run.font.size = Pt(10)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.left_indent = Cm(0.8)
        p.paragraph_format.first_line_indent = Cm(-0.8)


def main():
    doc = Document()
    setup(doc)
    title_page(doc)
    basic_information(doc)
    key_issues(doc)
    screenshots(doc)
    conclusions(doc)
    bibliography(doc)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print("written:", OUT)


if __name__ == "__main__":
    main()
