import express from "express";
import cors from "cors";
import path from 'node:path';
import sarusRoutes from "./datasets/sarus/routes.js";
import transportRoutes from "./datasets/transport/routes.js";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());
app.use('/',express.static(path.join(__dirname, 'public')));

/* SARUS ROUTES */
app.use("/", sarusRoutes);

/* TRANSPORT ROUTES */
app.use("/transport", transportRoutes);

const PORT = 5000;

app.listen(PORT, () => {
  console.log("RSAC Backend Running On Port", PORT);
});
