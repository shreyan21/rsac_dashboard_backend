import { Router } from "express";
import { pool } from "../../core/db.js";
import sarusMap from "./tableMap.js";
import SCHEMA from "./schema.js";

import ExcelJS from "exceljs";
import { Parser } from "json2csv";
import PDFDocument from "pdfkit";
import path from "path"
import url from "url"
import fs from "fs"
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
  cols.push("juvenile", "nests", "site", "habitat", "threats", "time");

  cols = await getExistingColumns(TABLE, cols);
  return { TABLE, cols, isLucknow };
}

// ✅ Query data for table
async function queryData(table, district, page, perPage) {
  let sql = `SELECT * FROM ${table}`;
  const params = [];

  if (district) {

    // Special handling ONLY for sarus_2_09_2020 Raebareli
    if (
      table === "uprsac_09xxxx_sarusfirst_13072023" &&
      String(district).toLowerCase()
 === "raebareli"
    ) {
  
      sql += `
        WHERE LOWER(REPLACE(district,' ','')) IN ('raebareli','raibareli','raebarely')
        AND LOWER(site) IN ('na','n/a')
      `;
  
    }
  
    // Normal Raebareli merge for other sarus tables
    else if (String(district).toLowerCase()
 === "raebareli") {
  
      sql += `
        WHERE LOWER(REPLACE(district,' ','')) IN ('raebareli','raibareli','raebarely')
      `;
  
    }
  
    // Normal districts
    else {
  
      params.push(district);
      sql += ` WHERE district = $${params.length}`;
  
    }
  }
  
  

  // ✅ Apply pagination only if page & perPage exist
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

const q= `SELECT 
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
    const { table, district, page , per_page  } = req.query;

    const TABLE = sarusMap[table];
    const config = SCHEMA[table];

    if (!TABLE || !config) {
      return res.status(400).json({ error: "Invalid Sarus table" });
    }

    /* ---------- WHERE CLAUSE ---------- */

/* ---------- WHERE CLAUSE ---------- */

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
    where = `
      WHERE LOWER(district) = LOWER($1)
    `;
    filterParams.push(districtStr);
  }
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

let dataQuery = `
  SELECT ${columns.join(", ")}
  FROM ${TABLE}
  ${where}
  ORDER BY gid
`;

let dataParams = [...filterParams];

if (Number(page) > 0 && Number(per_page) > 0) {
  dataQuery += `
    LIMIT $${dataParams.length + 1}
    OFFSET $${dataParams.length + 2}
  `;

  dataParams.push(per_page);
  dataParams.push((page - 1) * per_page);
}

const rows = await pool.query(dataQuery, dataParams);





    /* ---------- TOTAL ROW COUNT (for pagination only) ---------- */
    const countQuery = `
    SELECT COUNT(*) AS total_rows
    FROM ${TABLE}
    ${where}
  `;
  
  const countResult = await pool.query(countQuery, filterParams);
  




    /* ---------- TOTAL SARUS ---------- */

    const totalQuery = `
      SELECT COALESCE(SUM(sarus_coun),0) AS sarus_count
      FROM ${TABLE}
      ${where}
    `;

    const total = await pool.query(totalQuery, filterParams);

    /* ---------- DISTRICT CHART ---------- */

    /* ---------- DISTRICT CHART (All Districts View) ---------- */

let districtChart = [];
let siteChart = [];

// When NO district selected → show district-wise chart
if (!district && config.hasDistrict) {
  const q = `
    SELECT 
      CASE
        WHEN LOWER(REPLACE(district,' ','')) 
             IN ('raebareli','raibareli','raebarely')
        THEN 'Raebareli'
        ELSE district
      END AS district,
      SUM(sarus_coun) AS sarus_count
    FROM ${TABLE}
    GROUP BY 
      CASE
        WHEN LOWER(REPLACE(district,' ','')) 
             IN ('raebareli','raibareli','raebarely')
        THEN 'Raebareli'
        ELSE district
      END
    ORDER BY district
  `;

  districtChart = (await pool.query(q)).rows;
}


// When district selected → show site-wise chart
if (district && config.hasSite) {

  const districtStr = String(district).trim();   // 🔐 force string safely

  let siteWhere = "";
  let siteParams = [];

  if (districtStr.toLowerCase() === "raebareli") {
    siteWhere = `
      WHERE LOWER(REPLACE(district,' ','')) 
      IN ('raebareli','raibareli','raebarely')
    `;
  } else {
    siteWhere = `WHERE LOWER(district) = LOWER($1)`;
    siteParams.push(districtStr);
  }

  const q = `
    SELECT site, SUM(sarus_coun) AS sarus_count
    FROM ${TABLE}
    ${siteWhere}
    GROUP BY site
    ORDER BY site
  `;

  siteChart = (await pool.query(q, siteParams)).rows;
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

router.all("/export", async (req, res) => {
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
    
        if (key === "time") {
         const dateValue = new Date(r[key]);
obj.DATE = dateValue.toLocaleDateString("en-GB");

        }
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

    // CSV                
    if (format === "csv") {

      const fields = ["SNo", ...Object.keys(transformedRows[0]).filter(f => f !== "SNo")];



const parser = new Parser({
  fields,
  excelStrings: true
});
      let csv = parser.parse(transformedRows);

      // -------- TITLE --------
      const chartTitle = district
        ? `Sarus Count by Site for ${district}`
        : "Sarus Count by Habitat";

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
        `TOTAL SARUS COUNT : ${totalSarus}\n` +
        `${chartTitle} \n\n` +
        csv;

      res.header("Content-Type", "text/csv");
      res.attachment("Sarus_Report.csv");

      return res.send(csv);
    }

    if (format === "excel") {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Sarus Report");
      // ✅ TOTAL SARUS COUNT (TOP)
      const totalSarus = transformedRows.reduce(
        (sum, r) => sum + (parseInt(r["SARUS COUNT"]) || 0),
        0
      );

      ws.mergeCells("A1", "H1");
      const totalCell = ws.getCell("A1");
      totalCell.value = `TOTAL SARUS COUNT : ${totalSarus}`;
      totalCell.font = {
        name: "Calibri",
        size: 14,
        bold: true,
        color: { argb: "003366" }
      };
      totalCell.alignment = {
        horizontal: "center",
        vertical: "middle"
      };

      // --- RSAC Logo + Title (top-left) ---
      const logoPath = path.join(__dirname, "../public/logo.jpg");
      if (fs.existsSync(logoPath)) {
        const logoId = wb.addImage({
          filename: logoPath,
          extension: "jpeg",
        });
        ws.addImage(logoId, {
          tl: { col: 0, row: 0 },
          ext: { width: 60, height: 60 },
        });

        // Title beside logo
        ws.mergeCells("B2", "G4");
        const titleCell = ws.getCell("B2");
        titleCell.value =
          "Remote Sensing Applications Centre\nLucknow, Uttar Pradesh";
        titleCell.font = {
          name: "Calibri",
          size: 15,
          bold: true,
          color: { argb: "003366" },
        };
        titleCell.alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        };
      }

      // --- Report subtitle ---
      ws.mergeCells("A5", "H5");
      const subTitle = ws.getCell("A5");
      const chartTitle = district
        ? `Sarus Count by Site for ${district}`
        : "Sarus Count by Habitat";

      subTitle.value = `${chartTitle} `
      // (${new Date().toLocaleDateString("en-IN", {
      //   day: "2-digit",
      //   month: "2-digit",
      //   year: "numeric"
      // })})`;

      subTitle.font = { size: 13, bold: true };
      subTitle.alignment = { horizontal: "center" };

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
  const habitatLabels = Object.keys(habitatTotals);
  const habitatValues = Object.values(habitatTotals);

  const compLabels = ["Adults", "Juveniles", "Nests"];
  const compValues = [totalAdults, totalJuveniles, totalNests];

  // ---- Receive images from frontend ----
  const habitatImage = req.body?.habitatChartImage;
  const compositionImage = req.body?.compositionChartImage;

  const lastRow = ws.lastRow.number + 2;

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

    try {

      const barBuffer = Buffer.from(barChartImage.split(",")[1], "base64");

      const barImgId = wb.addImage({
        buffer: barBuffer,
        extension: "png"
      });

      const lastTableRow = ws.lastRow.number + 2;

      // ---- BIG & CLEAR BAR CHART ----
      ws.addImage(barImgId, {
        tl: { col: 2, row: lastTableRow },
        ext: {
          width: 900,   // LARGE WIDTH
          height: 700   // CLEAR HEIGHT
        },
        editAs: "oneCell"
      });

    } catch (err) {
      console.error("Excel bar chart insert failed:", err.message);
    }

  }

}




      // Footer
      const footerRow = ws.addRow([]);
      footerRow.getCell(1).value = "Generated by RSAC UP";
      footerRow.font = { italic: true, color: { argb: "777777" } };

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
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      doc.pipe(res);

      // ---- faint watermark -------------------------------------------------
      const wmPath = path.join(__dirname, "../public/logo.jpg");
      if (fs.existsSync(wmPath)) {
        const wmBuffer = fs.readFileSync(wmPath);
        const wmW = 300, wmH = 300;
        const wmX = (pageWidth - wmW) / 2;
        const wmY = (pageHeight - wmH) / 2;
        doc.save(); doc.opacity(0.07);
        doc.image(wmBuffer, wmX, wmY, { width: wmW, height: wmH });
        doc.restore();
      }

      // ---- header (logo + title) -------------------------------------------
      const logoPath = path.join(__dirname, "../public/logo.jpg");
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        doc.image(logoBuffer, 40, 30, { width: 45 });
      }
      doc.fontSize(16).fillColor("#003366")
        .text("Remote Sensing Applications Centre", 95, 35);
      doc.fontSize(12).fillColor("#003366")
        .text("Lucknow, Uttar Pradesh", 95, 55);
      doc.moveDown()
        .fontSize(14).fillColor("#000")
        .text(`Sarus Crane Report (${new Date().toLocaleDateString()})`, { align: "center" });

      let y = 130;   // start of chart area

      // ---- Pie chart + **legend higher & readable** ------------------------
      if (chartImage && transformedRows.length) {
        try {
          const chartBuffer = Buffer.from(chartImage.split(",")[1], "base64");

          // ---- chart (compact) --------------------------------------------
          const chartW = 300;
          const chartH = 240;
          const chartX = 50;
          const chartY = y + 10;
          doc.image(chartBuffer, chartX, chartY, { width: chartW, height: chartH });

          // ---- legend (moved up, starts higher) ---------------------------
          const legendX = chartX + chartW + 35;
          let legendY = chartY - 15;   // <-- moved 15 px higher

          // district totals
          const distCounts = {};
          transformedRows.forEach(r => {
            const d = r.district || "Unknown";
            const c = parseInt(r["SARUS COUNT"]) || 0;
            distCounts[d] = (distCounts[d] || 0) + c;
          });

          const districts = Object.keys(distCounts);
          const colors = districts.map((_, i) => `hsl(${(i * 60) % 360}, 70%, 65%)`);

          // legend title
          doc.fontSize(12).fillColor("#000")
            .text("District Legends:", legendX, legendY);
          legendY += 22;

          const lineHeight = 20;
          const maxLabelW = 200;
          const maxLegendH = pageHeight - 120;

          districts.forEach((district, i) => {
            if (legendY > maxLegendH) { doc.addPage(); legendY = 60; }

            // colour box
            doc.save();
            doc.rect(legendX, legendY, 15, 15).fill(colors[i]).stroke();
            doc.restore();

            // label + count
            const label = `${district}: ${distCounts[district]} Sarus`;
            doc.fontSize(10).fillColor("#000")
              .text(label, legendX + 22, legendY - 1, {
                width: maxLabelW,
                align: "left",
                ellipsis: true
              });

            legendY += lineHeight;
          });

          // chart caption (centered under pie)
          const caption = districtFilter?.value
            ? `Sarus Count by Habitat`
            : "Sarus Count by District";
          doc.fontSize(10).fillColor("#555")
            .text(caption, chartX, chartY + chartH + 8,
              { align: "center", width: chartW });

          // table starts below the taller of chart vs legend
          y = Math.max(chartY + chartH, legendY) + 35;

        } catch (err) {
          console.error("Chart embedding failed:", err.message);
        }
      }

      // ---- Table (unchanged) -----------------------------------------------
      const rows = transformedRows;
      const headers = ["SNo", ...Object.keys(rows[0]).filter(h => h !== "gid" && h !== "SNo")];


      const colW = (pageWidth - 100) / headers.length;
      const tableY = y;

      // header row
      doc.font("Helvetica-Bold").fontSize(9);

     
      headers.forEach((h, i) => {

        let txt;
      
        const key = h.toLowerCase();
      
        if (key === "sno") txt = "SNo";
        else if (key === "sarus coun") txt = "SARUS COUNT";
        else if (key.toLowerCase() === "range_fore") txt = "RANGE FOREST";
        else if (key.toLowerCase() === "name_of_co") txt = "NAME OF COLONY";
        else txt = h.replace(/_/g, " ").toUpperCase();
      
        const x = 50 + i * colW;
      
        doc.rect(x, tableY, colW, 20).fill("#004c99");
      
        doc.fillColor("#fff")
          .text(txt, x + 3, tableY + 6, {
            width: colW - 6,
            align: "center"
          });
      });
      

      // data rows
      let rowY = tableY + 22;
      doc.font("Helvetica").fontSize(8).fillColor("#000");
      rows.forEach((row, rIdx) => {
        if (rowY > pageHeight - 60) { doc.addPage(); rowY = 50; }
        headers.forEach((h, i) => {
          const val = String(row[h] ?? "");
          const x = 50 + i * colW;
          if (rIdx % 2 === 0) doc.rect(x, rowY, colW, 14).fill("#f6f8fb");
          else doc.rect(x, rowY, colW, 14).fill("#fff");
          doc.strokeColor("#ddd").stroke();
          doc.fillColor("#000")
            .text(val, x + 3, rowY + 4, { width: colW - 6, align: "center" });
        });
        rowY += 14;
      });

      // ---- Footer -----------------------------------------------------------
      doc.fontSize(9).fillColor("#555")
        .text("Generated by RSAC UP", 0, pageHeight - 40, { align: "center" });

      doc.end();
      return;
    }
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).send("Export error: " + err.message);
  }
});

export default router;
