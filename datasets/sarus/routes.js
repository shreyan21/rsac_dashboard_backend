import { Router } from "express";
import { pool } from "../../core/db.js";
import sarusMap from "./tableMap.js";
import SCHEMA from "./schema.js";

import { Parser } from "json2csv";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

import path from "path"
import url from "url"
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));


const router = Router();

/* ================= DISTRICT DROPDOWN ================= */
async function getExistingColumns(tableName, columns) {
  const q = `SELECT column_name FROM information_schema.columns WHERE table_name = $1`;
  const res = await pool.query(q, [tableName]);
  const existing = res.rows.map((r) => r.column_name.toLowerCase());
  return columns.filter((c) => existing.includes(c.toLowerCase()));
}

// ✅ Build columns & table based on selection
async function buildQueryOptions(tableKey) {
  const TABLE = sarusMap[tableKey];
  if (!TABLE) throw new Error("Invalid table name");

  const isLucknow = TABLE === sarusMap["sarus_lucknow_population"];
  const isThird = TABLE === sarusMap["sarus_27_09_2021"];

  let cols = [];
  if (!isLucknow) cols.push("district");
  cols.push("latitude", "longitude");
  if (!isLucknow) cols.push("pollution");
  cols.push("sarus_coun");
  if (!isThird) cols.push("adults");
  else cols.push("adult AS adults");
  cols.push("juvenile", "nests", "habitat", "threats", "time");

  cols = await getExistingColumns(TABLE, cols);
  return { TABLE, cols, isLucknow };
}

// ✅ Query data for table
async function queryData(table, district, page, perPage) {

  let sql = `SELECT * FROM ${table}`;
  const params = [];

  if (district) {

    if (
      table === "uprsac_09xxxx_sarusfirst_13072023" &&
      String(district).toLowerCase() === "raebareli"
    ) {
      sql += `
        WHERE LOWER(REPLACE(district,' ','')) 
        IN ('raebareli','raibareli','raebarely')
      `;
    }

    else if (String(district).toLowerCase() === "raebareli") {
      sql += `
        WHERE LOWER(REPLACE(district,' ','')) 
        IN ('raebareli','raibareli','raebarely')
      `;
    }

    else {
      params.push(district);
      sql += ` WHERE district = $${params.length}`;
    }
  }

  if (page && perPage) {
    params.push(perPage);
    sql += ` LIMIT $${params.length}`;

    params.push((page - 1) * perPage);
    sql += ` OFFSET $${params.length}`;
  }

  const result = await pool.query(sql, params);
  return result.rows;
}



router.get("/districts", async (req, res) => {
  try {
    const { table } = req.query;
    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config || !config.hasDistrict) {
      return res.json([]);
    }

    const q = `SELECT 
  INITCAP(
    CASE 
      WHEN LOWER(REPLACE(district,' ','')) IN 
        ('raebareli','raibareli','raebarely')
      THEN 'raebareli'
      ELSE district
    END
  ) AS district
FROM ${TABLE}
GROUP BY 1
ORDER BY 1`


    const r = await pool.query(q);
    res.json(r.rows.map(r => r.district));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MAIN SARUS REPORT ================= */

router.get("/report", async (req, res) => {
  try {
    const { table, district, page, per_page } = req.query;

    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config) {
      return res.status(400).json({ error: "Invalid Sarus table" });
    }

    let where = "";
    let filterParams = [];

    if (district && config.hasDistrict) {
      const districtStr = String(district).trim();

      if (districtStr.toLowerCase() === "raebareli") {
        where = `
          WHERE LOWER(REPLACE(district,' ','')) 
          IN ('raebareli','raibareli','raebarely')
        `;
      } else {
        where = `WHERE LOWER(district) = LOWER($1)`;
        filterParams.push(districtStr);
      }
    }



    /* ---------- BUILD COLUMN LIST SAFELY ---------- */

    const columns = [
      "gid",
      "latitude",
      "longitude",
      "habitat",
      "sarus_coun AS sarus_count"
    ];

    if (config.hasDistrict) columns.unshift("district");
    if (config.hasThreats) columns.push("threats");
    if (config.hasRangeFO) columns.push("range_fore");
    if (config.hasColony) columns.push("name_of_co");
    if (config.hasAdults) columns.push("adults");
    if (config.hasJuvenile) columns.push("juvenile");
    if (config.hasNests) columns.push("nests");


    let dataQuery = `
      SELECT ${columns.join(", ")}
      FROM ${TABLE}
      ${where}
      ORDER BY gid
    `;

    let dataParams = [...filterParams];

    if (page && per_page) {
      dataQuery += `
        LIMIT $${dataParams.length + 1}
        OFFSET $${dataParams.length + 2}
      `;
      dataParams.push(per_page);
      dataParams.push((page - 1) * per_page);
    }

    const rows = await pool.query(dataQuery, dataParams);

    const countQuery = `
      SELECT COUNT(*) AS total_rows
      FROM ${TABLE}
      ${where}
    `;

    const countResult = await pool.query(countQuery, filterParams);

    const totalQuery = `
      SELECT COALESCE(SUM(sarus_coun),0) AS sarus_count
      FROM ${TABLE}
      ${where}
    `;

    const total = await pool.query(totalQuery, filterParams);

    // -------- District Chart --------
    let districtChart = [];
    // -------- HABITAT CHART (for Lucknow + others if needed) --------
    let habitatChart = [];
    let population = {};

    if (table === "sarus_lucknow_population") {

      // Habitat chart
      const habitatQuery = `
    SELECT habitat, SUM(sarus_coun) AS sarus_count
    FROM ${TABLE}
    GROUP BY habitat
    ORDER BY habitat
  `;

      habitatChart = (await pool.query(habitatQuery)).rows;

      // Adults / Juveniles / Nests totals
      const popQuery = `
    SELECT 
      COALESCE(SUM(adults),0) AS adults,
      COALESCE(SUM(juvenile),0) AS juvenile,
      COALESCE(SUM(nests),0) AS nests
    FROM ${TABLE}
  `;

      population = (await pool.query(popQuery)).rows[0];
    }

    if (config.hasDistrict) {

      if (!district) {
        // Top 20 districts
        const q = `
      SELECT district, SUM(sarus_coun) AS sarus_count
      FROM ${TABLE}
      GROUP BY district
      ORDER BY sarus_count DESC
      LIMIT 20
    `;
        districtChart = (await pool.query(q)).rows;
      }

      else {
        // If district selected → show habitat breakdown
        const q = `
      SELECT habitat AS district, SUM(sarus_coun) AS sarus_count
      FROM ${TABLE}
      ${where}
      GROUP BY habitat
      ORDER BY sarus_count DESC
    `;
        districtChart = (await pool.query(q, filterParams)).rows;
      }

    }



    res.json({
      rows: rows.rows || [],
      totalRows: Number(countResult.rows[0]?.total_rows || 0),
      total: Number(total.rows[0]?.sarus_count || 0),
      charts: {
        district: districtChart || [],
        habitat: habitatChart || [],
        population: population || {}
      }

    });




  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


/* ================= EXPORT SARUS ================= */

router.all("/export", async (req, res) => {
  function formatReportTitle(tableKey) {
    if (!tableKey) return "Sarus Census Report";

    const formatted = tableKey
      .replace("sarus_", "")
      .replace(/_/g, "/");

    return `Sarus Census Report for Sarus ${formatted}`;
  }

  try {
    const { format = "csv", table, district = "", page = 1, per_page = 100, chartImage } =
      req.method === "POST" ? req.body : req.query;

    if (!table) return res.status(400).send("table parameter required");

    let rows = [];

    // ✅ ALWAYS export FULL data (no pagination)
    const TABLE = sarusMap[table];
    if (!TABLE) return res.status(400).send("Invalid table key");

    rows = await queryData(TABLE, district || null, null, null);



    // ✅ Rename fields just for export
    const transformedRows = rows.map((r, index) => {

      const obj = {};

      // ✅ SERIAL NUMBER FIRST
      obj.SNo = index + 1;

      // copy rest except gid
      Object.keys(r).forEach(key => {

        if (key === "gid") return;

        if (key === "site") return;

        else if (key === "sarus_coun") {
          obj["SARUS COUNT"] = r[key];
        }
        else {

          // ---- COLUMN RENAME FIX ----
          if (key.toLowerCase() === "range_fore") {
            obj["RANGE FOREST"] = r[key];
          }
          else if (key.toLowerCase() === "name_of_co") {
            obj["NAME OF COLONY"] = r[key];
          }
          else {
            obj[key] = r[key];
          }

        }


      });

      return obj;
    });



    if (!transformedRows.length) return res.status(200).send("No data to export");
    const reportTitle = formatReportTitle(table);

    const totalSarus = transformedRows.reduce(
      (sum, r) => sum + (parseInt(r["SARUS COUNT"]) || 0),
      0
    );
    
    // CSV                
    if (format === "csv") {

      const fields = ["SNo", ...Object.keys(transformedRows[0]).filter(f => f !== "SNo")];



      const parser = new Parser({
        fields,
        excelStrings: true
      });
      let csv = parser.parse(transformedRows);

      // -------- TITLE --------
      const reportTitle = formatReportTitle(table);


      const reportDate = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });


      // -------- TOTAL SARUS COUNT --------
      const totalSarus = transformedRows.reduce(
        (sum, r) => sum + (parseInt(r["SARUS COUNT"]) || 0),
        0
      );

      // -------- PREPEND AT TOP --------
      csv =
        `${reportTitle}\n` +
        `TOTAL SARUS COUNT : ${totalSarus}\n\n` +
        csv;


      res.header("Content-Type", "text/csv");
      res.attachment("Sarus_Report.csv");

      return res.send(csv);
    }

    if (format === "excel") {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Sarus Report");

      // ===== REPORT TITLE =====
      const reportTitle = formatReportTitle(table);

      ws.mergeCells("A1:H1");
      ws.getCell("A1").value = reportTitle;
      ws.getCell("A1").font = { size: 16, bold: true };
      ws.getCell("A1").alignment = { horizontal: "center" };

      // ===== ORGANIZATION NAME =====
      ws.mergeCells("A2:H2");
      ws.getCell("A2").value = "Remote Sensing Applications Centre, Uttar Pradesh";
      ws.getCell("A2").font = { size: 13, bold: true };
      ws.getCell("A2").alignment = { horizontal: "center" };

      // ===== TOTAL SARUS COUNT =====
      const totalSarus = transformedRows.reduce(
        (sum, r) => sum + (parseInt(r["SARUS COUNT"]) || 0),
        0
      );

      ws.mergeCells("A3:H3");
      ws.getCell("A3").value = `TOTAL SARUS COUNT : ${totalSarus}`;
      ws.getCell("A3").font = { size: 12, bold: true };
      ws.getCell("A3").alignment = { horizontal: "center" };

      ws.addRow([]);
      ws.addRow([]);


      // --- Start of table ---
      const headers = ["SNo", ...Object.keys(transformedRows[0]).filter(h => h !== "SNo")];


      ws.addRow(
        headers.map(h =>
          h === "SNo" ? "SNo" :


            h.replace(/_/g, " ")
        )
      );

      const headerRow = ws.lastRow;
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "003366" },
      };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };
      headerRow.height = 20;

      transformedRows.forEach((r) => ws.addRow(Object.values(r)));
      // ✅ TOTAL SARUS COUNT (EXCEL)





      // Auto width and zebra striping
      // ✅ Auto-fit columns and wrap text properly
      ws.columns.forEach((col) => {
        let maxLength = 0;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value ? cell.value.toString() : "";
          maxLength = Math.max(maxLength, v.length);
        });
        col.width = Math.min(Math.max(maxLength + 2, 12), 40); // auto-fit range
      });

      ws.eachRow((row, rowNum) => {
        row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        if (rowNum > 7) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: rowNum % 2 === 0 ? "FFF5F5F5" : "FFFFFFFF" },
          };
        }
      });



      // ================= SARUS LUCKNOW POPULATION EXCEL PIE CHARTS =================

      if (table === "sarus_lucknow_population") {

        // ---- Prepare habitat totals ----
        const habitatTotals = {};
        let totalAdults = 0;
        let totalJuveniles = 0;
        let totalNests = 0;

        transformedRows.forEach(r => {

          const habitat = (r.habitat && r.habitat.trim()) || "Unknown Habitat";
          const sarus = parseInt(r["SARUS COUNT"]) || 0;

          habitatTotals[habitat] = (habitatTotals[habitat] || 0) + sarus;

          totalAdults += parseInt(r.adults) || 0;
          totalJuveniles += parseInt(r.juvenile) || 0;
          totalNests += parseInt(r.nests) || 0;
        });

        // ---- Build chart data ----


        // ---- Receive images from frontend ----
        const habitatImage = req.body?.habitatChartImage || null;
        const compositionImage = req.body?.compositionChartImage || null;


        const lastRow = ws.lastRow.number + 4;

        if (habitatImage && compositionImage) {

          const img1 = wb.addImage({
            buffer: Buffer.from(habitatImage.split(",")[1], "base64"),
            extension: "png"
          });

          const img2 = wb.addImage({
            buffer: Buffer.from(compositionImage.split(",")[1], "base64"),
            extension: "png"
          });

          // ---- Place charts side-by-side ----
          ws.addImage(img1, {
            tl: { col: 0, row: lastRow },
            ext: { width: 450, height: 230 }
          });

          ws.addImage(img2, {
            tl: { col: 3, row: lastRow },
            ext: { width: 450, height: 230 }
          });

        }
      }

      else {

        // ================= NORMAL SARUS BAR CHART FOR EXCEL =================

        const barChartImage = req.body?.chartImage;

        if (barChartImage && barChartImage.startsWith("data:image")) {

          const barBuffer = Buffer.from(barChartImage.split(",")[1], "base64");

          const imgId = wb.addImage({
            buffer: barBuffer,
            extension: "png"
          });

          const lastRow = ws.lastRow.number + 2;

          ws.addImage(imgId, {
            tl: { col: 0, row: lastRow },
            ext: {
              width: 750,
              height: 380
            }
          });
          const showingRow = lastRow + 28;

          ws.mergeCells(`A${showingRow}:H${showingRow}`);
          const showCell = ws.getCell(`A${showingRow}`);
          showCell.value = district
            ? `Showing data for ${district}`
            : `Showing Top 20 of 75 districts`;

          showCell.font = { size: 11, italic: true };
          showCell.alignment = { horizontal: "center" };

        }


      }



      // ===== PIE CHARTS AFTER TABLE =====
      if (table === "sarus_lucknow_population") {

        const habitatImage = req.body?.habitatChartImage || null;
        const compositionImage = req.body?.compositionChartImage || null;

        const chartStartRow = ws.lastRow.number + 3;

        if (habitatImage && compositionImage) {

          const img1 = wb.addImage({
            buffer: Buffer.from(habitatImage.split(",")[1], "base64"),
            extension: "png"
          });

          const img2 = wb.addImage({
            buffer: Buffer.from(compositionImage.split(",")[1], "base64"),
            extension: "png"
          });

          ws.addImage(img1, {
            tl: { col: 0, row: chartStartRow },
            ext: { width: 350, height: 220 }
          });

          ws.addImage(img2, {
            tl: { col: 4, row: chartStartRow },
            ext: { width: 350, height: 220 }
          });
        }
      }

      // Footer
      const footerStartRow = ws.lastRow.number + 35;

      ws.mergeCells(`A${footerStartRow}:H${footerStartRow}`);

      const footerCell = ws.getCell(`A${footerStartRow}`);
      footerCell.value = "Generated by RSAC UP";
      footerCell.font = { italic: true, color: { argb: "777777" } };
      footerCell.alignment = { horizontal: "center" };


      // Output response
      ws.views = [{ state: "frozen", ySplit: 6 }];
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=RSAC_Sarus_Report.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      await wb.xlsx.write(res);
      res.end();
      return;
    }




    // ---------------------------------------------------------------
    if (format === "pdf") {
      return res.json({
        rows: transformedRows,
        totalSarus,
        reportTitle
    });



      // ---- header (logo + title) -------------------------------------------

     
    }
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).send("Export error: " + err.message);
  }
});

export default router;
