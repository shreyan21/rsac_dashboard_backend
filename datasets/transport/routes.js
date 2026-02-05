import PDFDocument from "pdfkit";
import { Router } from "express";
import { pool } from "../../core/db.js";

const router = Router();

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
      SELECT COUNT(*), 
             MAX(distance), 
             MIN(distance)
      FROM uprsac_09xxxx_uproadways_04102023
    `);

    /* ---------- RTA ---------- */

    const rta = await pool.query(`
      SELECT COUNT(*), 
             MAX(length_km), 
             MIN(length_km)
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

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=transport_dashboard.pdf");

    doc.pipe(res);

    doc.fontSize(18).text("RSAC Transport Dashboard Summary", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text("Generated from Transport Dashboard");
    doc.moveDown();

    doc.text("Includes:");
    doc.text("- National Highway Analytics");
    doc.text("- State Highway Analytics");
    doc.text("- Other Roads Analytics");
    doc.text("- Railway Analytics");
    doc.text("- Expressways Summary");
    doc.text("- Ganga Cruise Summary");
    doc.text("- Roadways Summary");
    doc.text("- RTA Summary");

    doc.end();

  } catch (err) {

    console.error(err);
    res.status(500).send(err.message);

  }

});


export default router;
