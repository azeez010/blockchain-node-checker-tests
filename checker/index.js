import { BlockchainNodeAvailabilitySupervisor }  from "./supervisor.js"
import fs  from "fs"
import { YAMLConfig } from "../controller/utils.js"

async function main()
{
    var blockSupervisor = new BlockchainNodeAvailabilitySupervisor()
    return await blockSupervisor.run()
}

var task;

(async () => {
    task = await main()
})()


fs.watch(YAMLConfig.fileName, async function (event, filename) {
    if (event == 'change') {
        task.stop();
        task = await main()
    }
});