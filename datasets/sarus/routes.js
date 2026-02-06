import { Router } from "express";
import { pool } from "../../core/db.js";
import sarusMap from "./tableMap.js";
import SCHEMA from "./schema.js";

import ExcelJS from "exceljs";
import { Parser } from "json2csv";
import PDFDocument from "pdfkit";

const router = Router();

/* ================= DISTRICT DROPDOWN ================= */

router.get("/districts", async (req, res) => {
  try {
    const { table } = req.query;
    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config || !config.hasDistrict) {
      return res.json([]);
    }

    const q = `
      SELECT DISTINCT district
      FROM ${TABLE}
      WHERE district IS NOT NULL
      ORDER BY district
    `;

    const r = await pool.query(q);
    res.json(r.rows.map(r => r.district));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MAIN SARUS REPORT ================= */

router.get("/report", async (req, res) => {
  try {
    const { table, district, page = 1, per_page = 25 } = req.query;

    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config) {
      return res.status(400).json({ error: "Invalid Sarus table" });
    }

    /* ---------- WHERE CLAUSE ---------- */

    let where = "";
    const params = [];

    if (district && config.hasDistrict) {
      where = "WHERE district = $1";
      params.push(district);
    }

    /* ---------- BUILD COLUMN LIST ---------- */

    const columns = [
      "gid",
      "latitude",
      "longitude",
      "habitat",
      "sarus_coun AS sarus_count"
    ];

    if (config.hasDistrict) columns.unshift("district");

    if (config.hasSite) columns.push("site");

    if (config.hasRangeFO) columns.push("range_fore");

    if (config.hasColony) columns.push("name_of_co");

    if (config.hasAdults) columns.push("adults");

    if (config.hasJuvenile) columns.push("juvenile");

    if (config.hasNests) columns.push("nests");




    /* ---------- TABLE DATA ---------- */

    const dataQuery = `
      SELECT ${columns.join(", ")}
      FROM ${TABLE}
      ${where}
      ORDER BY gid
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const rows = await pool.query(dataQuery, [
      ...params,
      per_page,
      (page - 1) * per_page
    ]);
    /* ---------- TOTAL ROW COUNT (for pagination only) ---------- */
    const countQuery = `
    SELECT COUNT(*) AS total_rows
    FROM ${TABLE}
    ${where}
  `;
  
  const countResult = await pool.query(countQuery, params);
  




    /* ---------- TOTAL SARUS ---------- */

    const totalQuery = `
      SELECT COALESCE(SUM(sarus_coun),0) AS sarus_count
      FROM ${TABLE}
      ${where}
    `;

    const total = await pool.query(totalQuery, params);

    /* ---------- DISTRICT CHART ---------- */

    /* ---------- DISTRICT CHART (All Districts View) ---------- */

let districtChart = [];
let siteChart = [];

// When NO district selected → show district-wise chart
if (!district && config.hasDistrict) {
  const q = `
    SELECT district, SUM(sarus_coun) AS sarus_count
    FROM ${TABLE}
    GROUP BY district
    ORDER BY district
  `;
  districtChart = (await pool.query(q)).rows;
}

// When district selected → show site-wise chart
if (district && config.hasSite) {
  const q = `
    SELECT site, SUM(sarus_coun) AS sarus_count
    FROM ${TABLE}
    WHERE district = $1
    GROUP BY site
    ORDER BY site
  `;
  siteChart = (await pool.query(q, [district])).rows;
}


    /* ---------- HABITAT CHART ---------- */

    const habitatChart = (
      await pool.query(`
        SELECT habitat, SUM(sarus_coun) AS sarus_count
        FROM ${TABLE}
        GROUP BY habitat
      `)
    ).rows;

    /* ---------- POPULATION SUMMARY ---------- */

    const popParts = [];
    if (config.hasAdults) popParts.push("SUM(adults) AS adults");
    if (config.hasJuvenile) popParts.push("SUM(juvenile) AS juvenile");
    if (config.hasNests) popParts.push("SUM(nests) AS nests");

    const population = popParts.length
      ? (
        await pool.query(`
            SELECT ${popParts.join(", ")}
            FROM ${TABLE}
          `)
      ).rows[0]
      : {};

    /* ---------- RESPONSE ---------- */

    res.json({
      rows: rows.rows,
      totalRows: Number(countResult.rows[0].total_rows), // ← for pagination
      total: Number(total.rows[0].sarus_count),          // ← for display
      charts: {
        district: districtChart,
        site: siteChart,
        habitat: habitatChart,
        population
      }
    });
    
    

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= EXPORT SARUS ================= */

router.get("/export", async (req, res) => {
  try {
    const { table, format = "csv", district } = req.query;

    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config) {
      return res.status(400).send("Invalid table");
    }

    let where = "";
    const params = [];

    if (district && config.hasDistrict) {
      where = "WHERE district = $1";
      params.push(district);
    }

    const cols = [
      "gid AS sno",
      "habitat",
      "sarus_coun AS sarus_count",
      "latitude",
      "longitude"
    ];

    if (config.hasDistrict) cols.unshift("district");

    if (config.hasSite) cols.push("site");

    if (config.hasRangeFO) cols.push("range_fore");

    if (config.hasColony) cols.push("name_of_co");

    if (config.hasAdults) cols.push("adults");

    if (config.hasJuvenile) cols.push("juvenile");

    if (config.hasNests) cols.push("nests");



    const q = `
      SELECT ${cols.join(", ")}
      FROM ${TABLE}
      ${where}
      ORDER BY gid
    `;

    const result = await pool.query(q, params);
    const data = result.rows;

    if (!data.length) {
      return res.status(404).send("No data found");
    }

    /* -------- CSV -------- */

    if (format === "csv") {
      const parser = new Parser();
      const csv = parser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=sarus_report.csv");
      return res.send(csv);
    }

    /* -------- EXCEL -------- */

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Sarus Report");

      sheet.columns = Object.keys(data[0]).map(k => ({
        header: k.toUpperCase().replace("_", " "),
        key: k,
        width: 22
      }));

      data.forEach(r => sheet.addRow(r));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=sarus_report.xlsx"
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    /* -------- PDF -------- */

    if (format === "pdf") {
      const doc = new PDFDocument({ size: "A4", margin: 30 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=sarus_report.pdf");

      doc.pipe(res);
      doc.fontSize(16).text("RSAC Sarus Crane Report", { align: "center" });
      doc.moveDown();

      data.forEach((row, i) => {
        doc.fontSize(8).text(`${i + 1}. ${JSON.stringify(row)}`);
        doc.moveDown(0.5);
      });

      doc.end();
    }
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

export default router;
