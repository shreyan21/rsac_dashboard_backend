import PDFDocument from "pdfkit";
import { Router } from "express";
import { pool } from "../../core/db.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/* ---------------- TRANSPORT PDF EXPORT ---------------- */


router.get("/export", async (req, res) => {
  try {
    const data = await buildDashboardData();

    const doc = new PDFDocument({
      size: "A4",
      margin: 40
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=RSAC_Transport_Dashboard.pdf"
    );

    doc.pipe(res);

    /* ================= HEADER ================= */

    const logoPath = path.join(process.cwd(), "../public/images/logo.jpg");

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 30, { width: 55 });
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(
        "Remote Sensing Applications Centre, Uttar Pradesh",
        120,
        45
      );

    doc.moveDown(2);

    doc
      .fontSize(12)
      .text("Transport Dataset Summary", {
        align: "center"
      });

    doc.moveDown(2);

    /* ================= TWO COLUMN START ================= */

    const leftX = 50;
    const rightX = 300;
    let leftY = 140;
    let rightY = 140;

    const format = n => Number(n || 0).toLocaleString("en-IN");
    const km = n => `${Math.round(Number(n || 0))} km`;

    /* ===== LEFT COLUMN (Analytics) ===== */

    doc.font("Helvetica-Bold").fontSize(11)
      .text("2010–2018 Analytics", leftX, leftY);

    leftY += 20;

    const analyticsItems = [
      { title: "National Highways", ...data.analytics.nh },
      { title: "State Highways", ...data.analytics.sh },
      { title: "Other Roads", ...data.analytics.other },
      { title: "Railway Networks", ...data.analytics.rail }
    ];

    analyticsItems.forEach(item => {
      doc.font("Helvetica-Bold").fontSize(10)
        .text(item.title, leftX, leftY);

      leftY += 15;

      doc.font("Helvetica").fontSize(9)
        .text(`2010 : ${km(item.y2010)}`, leftX + 10, leftY);

      leftY += 12;

      doc.text(`2018 : ${km(item.y2018)}`, leftX + 10, leftY);

      leftY += 20;
    });

    /* ===== RIGHT COLUMN (2018 Layers) ===== */

    doc.font("Helvetica-Bold").fontSize(11)
      .text("2018 Layers", rightX, rightY);

    rightY += 20;

    /* EXPRESSWAYS */

    const totalExp =
      Number(data.expressways.existing.count) +
      Number(data.expressways.upcoming.count);

    const totalLength =
      Number(data.expressways.existing.sum) +
      Number(data.expressways.upcoming.sum);

    doc.font("Helvetica-Bold").fontSize(10)
      .text("Expressways", rightX, rightY);

    rightY += 15;

    doc.font("Helvetica").fontSize(9)
      .text(`Total Expressways : ${totalExp}`, rightX + 10, rightY);

    rightY += 12;

    doc.text(
      `Total Length : ${km(totalLength)}`,
      rightX + 10,
      rightY
    );

    rightY += 20;

    /* GANGA */

    doc.font("Helvetica-Bold")
      .text("Ganga Cruise Route", rightX, rightY);

    rightY += 15;

    doc.font("Helvetica")
      .text(
        `Total Navigable Length : ${km(data.ganga.sum)}`,
        rightX + 10,
        rightY
      );

    rightY += 20;

    /* ROADWAYS */

    doc.font("Helvetica-Bold")
      .text("UP Roadways Routes", rightX, rightY);

    rightY += 15;

    doc.font("Helvetica")
      .text(`Total Routes : ${format(data.roadways.count)}`, rightX + 10, rightY);

    rightY += 12;

    doc.text(`Longest : ${km(data.roadways.max)}`, rightX + 10, rightY);

    rightY += 12;

    doc.text(`Shortest : ${km(data.roadways.min)}`, rightX + 10, rightY);

    rightY += 20;

    /* RTA */

    doc.font("Helvetica-Bold")
      .text("UP RTA Routes", rightX, rightY);

    rightY += 15;

    doc.font("Helvetica")
      .text(`Total Routes : ${format(data.rta.count)}`, rightX + 10, rightY);

    rightY += 12;

    doc.text(`Longest : ${km(data.rta.max)}`, rightX + 10, rightY);

    rightY += 12;

    doc.text(`Shortest : ${km(data.rta.min)}`, rightX + 10, rightY);

    /* ================= FOOTER ================= */

    const today = new Date();
    const formattedDate =
      String(today.getDate()).padStart(2, "0") +
      "/" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "/" +
      today.getFullYear();

    doc.moveDown(5);

    doc
      .fontSize(9)
      .fillColor("gray")
      .text(
        `Generated by RSAC UP, ${formattedDate}`,
        0,
        780,
        { align: "center" }
      );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("PDF generation failed");
  }
});

export default router;




