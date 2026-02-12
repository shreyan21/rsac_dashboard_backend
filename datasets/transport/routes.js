import PDFDocument from "pdfkit";
import { Router } from "express";
import { pool } from "../../core/db.js";
import path from "path";
import fs from "fs"

import { fileURLToPath } from 'url';

// Recreate __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import axios from "axios"
import tableMap from './tableMap.js'

function resolveTable(friendlyKey) {
  const t = tableMap[friendlyKey];
  if (!t) throw new Error("Invalid Transport friendly key");
  return t;
}
async function getGangaCruiseStats(tableName) {

  const lenCol = await resolveLengthColumn(tableName);

  if (!lenCol) {
    return {
      total_routes: 0,
      total_length: 0,
      max_length: 0,
      min_length: 0
    };
  }

  const q = `
    SELECT 
      COUNT(*) AS total_routes,
      SUM(${lenCol}) AS total_length,
      
      MAX(${lenCol}) AS max_length,
      MIN(${lenCol}) AS min_length
    FROM ${tableName}
  `;

  const r = await pool.query(q);
  return r.rows[0];
}





async function resolveLengthColumn(tableName) {

  const res = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name=$1
    ORDER BY
      CASE
        WHEN column_name = 'length_km' THEN 1
        WHEN column_name ILIKE '%length_km%' THEN 2
        WHEN column_name ILIKE '%length%' THEN 3
        WHEN column_name ILIKE '%len%' THEN 4
        ELSE 5
      END
    LIMIT 1
  `, [tableName]);

  return res.rows.length ? res.rows[0].column_name : null;
}




async function getSelectableColumns(tableName) {
  // Exclude PostGIS geometry & huge blobs; keep simple scalar columns
  const q = `
    SELECT column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `;
  const r = await pool.query(q, [tableName]);
  return r.rows
    .map(x => ({ name: x.column_name, udt: x.udt_name }))
    .filter(
      c =>
        !["geom", "geometry"].includes(c.name.toLowerCase()) &&
        c.udt !== "geometry"
    )
    .map(c => c.name);
}

const router = Router();
async function buildDashboardData() {

  const nh2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_nationalhw_xxxx2018`);
  const nh2018 = await pool.query(`SELECT SUM(length_km) FROM national_highway_2018`);

  const sh2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_statehighw_xxxx2018`);
  const sh2018 = await pool.query(`SELECT SUM(length_km) FROM state_highway_2018`);

  const or2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_rdnonhshex_xxxx2018`);
  const or2018 = await pool.query(`SELECT SUM(length_km) FROM other_roads_2018`);

  const rail2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_railwaynet_xxxx2018`);
  const rail2018 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_uprailways_06072023`);

  const expExisting = await pool.query(`
      SELECT COUNT(*), SUM(shape_leng), MAX(shape_leng), MIN(shape_leng)
      FROM upeida_09xxxx_existngexp_23082023
  `);

  const expUpcoming = await pool.query(`
      SELECT COUNT(*), SUM(shape_leng), MAX(shape_leng), MIN(shape_leng)
      FROM upeida_09xxxx_upcmingexp_23082023
  `);

  const ganga = await pool.query(`
      SELECT COUNT(*), SUM(shape_leng), MAX(shape_leng)
      FROM uprsac_09xxxx_gangacruse_06022023
  `);

  const roadways = await pool.query(`
      SELECT COUNT(*), MAX(distance), MIN(distance)
      FROM uprsac_09xxxx_uproadways_04102023
  `);

  const rta = await pool.query(`
      SELECT COUNT(*), MAX(length_km), MIN(length_km)
      FROM transd_09xxxx_roadwayrta_27092023
  `);

  return {
    analytics: {
      nh: { y2010: nh2010.rows[0].sum, y2018: nh2018.rows[0].sum },
      sh: { y2010: sh2010.rows[0].sum, y2018: sh2018.rows[0].sum },
      other: { y2010: or2010.rows[0].sum, y2018: or2018.rows[0].sum },
      rail: { y2010: rail2010.rows[0].sum, y2018: rail2018.rows[0].sum }
    },
    expressways: {
      existing: expExisting.rows[0],
      upcoming: expUpcoming.rows[0]
    },
    ganga: ganga.rows[0],
    roadways: roadways.rows[0],
    rta: rta.rows[0]
  };
}


router.get("/dashboard", async (req, res) => {

  try {

    /* ---------- 2010–2018 ANALYTICS ---------- */

    const nh2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_nationalhw_xxxx2018`);
    const nh2018 = await pool.query(`SELECT SUM(length_km) FROM national_highway_2018`);

    const sh2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_statehighw_xxxx2018`);
    const sh2018 = await pool.query(`SELECT SUM(length_km) FROM state_highway_2018`);

    const or2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_rdnonhshex_xxxx2018`);
    const or2018 = await pool.query(`SELECT SUM(length_km) FROM other_roads_2018`);

    const rail2010 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_railwaynet_xxxx2018`);
    const rail2018 = await pool.query(`SELECT SUM(length_km) FROM uprsac_09xxxx_uprailways_06072023`);

    /* ---------- EXPRESSWAYS ---------- */

    const expExisting = await pool.query(`
      SELECT COUNT(*), 
             SUM(shape_leng), 
             MAX(shape_leng), 
             MIN(shape_leng)
      FROM upeida_09xxxx_existngexp_23082023
    `);

    const expUpcoming = await pool.query(`
      SELECT COUNT(*), 
             SUM(shape_leng), 
             MAX(shape_leng), 
             MIN(shape_leng)
      FROM upeida_09xxxx_upcmingexp_23082023
    `);

    /* ---------- GANGA ---------- */

    const ganga = await pool.query(`
      SELECT COUNT(*), 
             SUM(shape_leng), 
             MAX(shape_leng)
      FROM uprsac_09xxxx_gangacruse_06022023
    `);

    /* ---------- ROADWAYS ---------- */

    const roadways = await pool.query(`
  SELECT 
    COUNT(*) as count,
    MAX(distance) as max,
    MIN(distance) as min
  FROM uprsac_09xxxx_uproadways_04102023
`);


    /* ---------- RTA ---------- */

    const rta = await pool.query(`
    SELECT 
      COUNT(*) as count,
      MAX(length_km) as max,
      MIN(length_km) as min
    FROM transd_09xxxx_roadwayrta_27092023
  `);


    res.json({

      analytics: {

        nh: {
          y2010: Number(nh2010.rows[0].sum),
          y2018: Number(nh2018.rows[0].sum)
        },

        sh: {
          y2010: Number(sh2010.rows[0].sum),
          y2018: Number(sh2018.rows[0].sum)
        },

        other: {
          y2010: Number(or2010.rows[0].sum),
          y2018: Number(or2018.rows[0].sum)
        },

        rail: {
          y2010: Number(rail2010.rows[0].sum),
          y2018: Number(rail2018.rows[0].sum)
        }
      },

      expressways: {
        existing: expExisting.rows[0],
        upcoming: expUpcoming.rows[0]
      },

      ganga: ganga.rows[0],

      roadways: roadways.rows[0],

      rta: rta.rows[0]

    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: err.message });

  }

});
function drawTable(doc, headers, rows) {
  const tableTop = doc.y;
  const columnSpacing = 15;
  const usableWidth = doc.page.width - doc.options.margin * 2;
  const columnWidth = usableWidth / headers.length;

  let y = tableTop;

  // Header
  doc.font("Helvetica-Bold").fontSize(10);

  headers.forEach((header, i) => {
    doc
      .rect(
        doc.options.margin + i * columnWidth,
        y,
        columnWidth,
        25
      )
      .fill("#1f3b4d");

    doc
      .fillColor("white")
      .text(
        header,
        doc.options.margin + i * columnWidth + 5,
        y + 8,
        {
          width: columnWidth - 10,
          align: "center"
        }
      );
  });

  y += 25;

  // Rows
  doc.font("Helvetica").fontSize(9);

  rows.forEach((row, rowIndex) => {
    const fillColor = rowIndex % 2 === 0 ? "#f4f6f9" : "#ffffff";

    row.forEach((cell, i) => {
      doc
        .rect(
          doc.options.margin + i * columnWidth,
          y,
          columnWidth,
          22
        )
        .fill(fillColor)
        .strokeColor("#dddddd")
        .stroke();

      doc
        .fillColor("#000000")
        .text(
          String(cell).toLocaleString("en-IN"),
          doc.options.margin + i * columnWidth + 5,
          y + 6,
          {
            width: columnWidth - 10,
            align: "center"
          }
        );
    });

    y += 22;

    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
  });

  doc.moveDown();
}


/* ---------------- TRANSPORT PDF EXPORT ---------------- */


  router.get("/export", async (req, res) => {
    try {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=RSAC_Transport_Report.pdf"
      );
  
      const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: 50
      });
  
      doc.pipe(res);
  
      const data = await buildDashboardData();
  
      /* ---------------- HEADER ---------------- */
  
      const logoPath = path.join(__dirname, "../../public/logo.jpg");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, { width: 50 });
      }
  
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text(
          "Remote Sensing Applications Centre, Uttar Pradesh",
          0,
          45,
          { align: "center" }
        );
  
      doc
        .fontSize(12)
        .font("Helvetica")
        .text("Transport Dataset Summary", { align: "center" });
  
      doc.moveDown(2);
  
      /* ================================
         SECTION 1 — 2010–2018 ANALYTICS
         ================================ */
  
      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#003366")
        .text("2010–2018 Analytics");
  
      doc.moveDown(0.8);
  
      const analyticsRows = [
        ["National Highways", data.analytics.nh.y2010, data.analytics.nh.y2018],
        ["State Highways", data.analytics.sh.y2010, data.analytics.sh.y2018],
        ["Other Roads", data.analytics.other.y2010, data.analytics.other.y2018],
        ["Railway Networks", data.analytics.rail.y2010, data.analytics.rail.y2018]
      ];
  
      drawTable(doc, ["Category", "2010 (km)", "2018 (km)"], analyticsRows);
  
      doc.moveDown(2);
  
      /* ================================
         SECTION 2 — 2018 LAYERS
         ================================ */
  
      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#003366")
        .text("2018 Layers");
  
      doc.moveDown(0.8);
  
      const layersRows = [
        [
          "Expressways",
          Number(data.expressways.existing.count) +
            Number(data.expressways.upcoming.count),
          Math.round(
            Number(data.expressways.existing.sum) +
              Number(data.expressways.upcoming.sum)
          )
        ],
        [
          "Ganga Cruise Route",
          Math.round(data.ganga.sum),
          1289
        ],
        [
          "UP Roadways Routes",
          data.roadways.count,
          Math.round(data.roadways.max)
        ],
        [
          "UP RTA Routes",
          data.rta.count,
          Math.round(data.rta.max)
        ]
      ];
  
      drawTable(doc, ["Layer", "Primary Value", "Secondary Value"], layersRows);
  
      doc.moveDown(2);
  
      doc
        .fontSize(9)
        .fillColor("#666")
        .text(
          `Generated by RSAC UP | ${new Date().toLocaleDateString("en-IN")}`,
          { align: "center" }
        );
  
      doc.end();
    } catch (err) {
      console.error(err);
      res.status(500).send("PDF generation failed");
    }
  });
  
  





export default router;




