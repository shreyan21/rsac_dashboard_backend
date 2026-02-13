import express from "express";
import cors from "cors";
import path from 'node:path';
import sarusRoutes from "./datasets/sarus/routes.js";
import transportRoutes from "./datasets/transport/routes.js";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use('/static', express.static(path.join(__dirname, 'client/public')));

app.use(cors());
app.use(express.static( 'public'));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* SARUS ROUTES */
app.use("/", sarusRoutes);

/* TRANSPORT ROUTES */
app.use("/transport", transportRoutes);

const PORT = 5000;

app.listen(PORT, () => {
  console.log("RSAC Backend Running On Port", PORT);
});
