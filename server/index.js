import express from "express";
import path from "path";
import { redisController } from "../controller/utils.js"
import { fileURLToPath } from 'url';

let app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//setting view engine to ejs
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, './views'))

//route for index page
app.get("/", async function (req, res) {
    let sla_levels = JSON.parse(await redisController.retrieve("slaLevels"))
    let sla_reports = JSON.parse(await redisController.retrieve("computedNodeSlaLevels"))
    let node_urls = JSON.parse(await redisController.retrieve("nodesJsonRPCUrl"))
    
    let context = {sla_levels, sla_reports, node_urls}
    
    res.render("index", context);
});

app.listen(8080, function () {
  console.log("Server is running on port 8080 ");
});