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

/* ---------------- TRANSPORT PDF EXPORT ---------------- */


router.get("/export", async (req, res) => {
  
  
})





export default router;




