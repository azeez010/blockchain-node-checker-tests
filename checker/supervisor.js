import got from "got"
import cron from "node-cron";
import { logger } from "../controller/init.js";
import { YAMLConfig, Helpers, redisController } from "../controller/utils.js"

export class BlockchainNodeAvailabilitySupervisor
{
    constructor()
    {
        this.nodesJsonRPCUrl = [];
        this.trustedNodes = {};
        this.configurations = YAMLConfig.read();
        this.time_interval = this.configurations?.time_interval;
        this.max_random_seconds = this.configurations?.max_random_seconds;
        this.clearAfterCompute = this.configurations?.clear_after_compute;
        this.slaLevels = Helpers.toArrayAndSort(this.configurations?.sla_level);
        this.chains = Object.keys(this.configurations.nodes);
        this.max_block_behind = this.configurations?.max_block_behind;
        this.isIntegrityCheckEnabled = this.configurations?.integrity_check; 
        
        this.initConfigurations();
        if(this.isIntegrityCheckEnabled) this.getTrustNodesToList();
    }
    
    async run()
    {    
        process.on('uncaughtException', function (err) {
            // console.error(err);
            console.log("Node NOT Exiting...");

        });

        console.log(`Pinging in every ${this.time_interval} sec`);
        var task = cron.schedule(`*/${this.time_interval} * * * * *`, async () => {
            await Helpers.entropinessStrategy(1, this.max_random_seconds)
            
            this.sendPingRequest()
            
            if(this.isIntegrityCheckEnabled && Helpers.isCoinFlipTailOrHead()) 
            {
                for(let chain of this.chains)
                {
                    let rpcMethodsForTrustNodes = this.prepareJSONRPCRequestsList(this.configurations.nodes[chain]?.rpc_checks, this.configurations.nodes[chain]?.id, chain, true);
                    this.integrityCheck(this.trustedNodes[chain], rpcMethodsForTrustNodes )
                }
            }
        });	

        this.runDailySLAClassifiers()
        return await task;
    }

    getTrustNodesToList()
    {
        for(let chain of this.chains)
        {
            let urls = this.configurations.nodes[chain]?.urls;
            
            if(urls != undefined || urls == [])
            {
                for(let url of urls)
                {
                    if(url.trusted) 
                    {
                        if(this.trustedNodes[chain]){
                            this.trustedNodes[chain].push(url.node)
                        } 
                        else{
                            this.trustedNodes[chain] = [url.node]
                        }
                    }
                }
            }
        }
    }

    sendPingRequest()
    {
        for(let chain of this.chains)
        {
            let urls = this.configurations.nodes[chain]?.urls
            if(urls != undefined || urls == [])
            {
                let jsonRPCRequests = this.prepareJSONRPCRequests(this.configurations.nodes[chain]?.rpc_checks, this.configurations.nodes[chain]?.id, chain)
                for(let url of urls)
                {   
                    this.pingRequest(url.node, jsonRPCRequests)
                }
            }
        }
    }

    prepareJSONRPCRequests(methods, id, chain, trust=false)
    {
        let rpc_methods = Object.keys(methods)
        let requests = []
        

        for(let method of rpc_methods) {
            // if rpc methods
            if(trust && methods[method]?.trusted) 
            {
                requests.push([{"jsonrpc":"2.0","method": methods[method]?.name || "", "params" :methods[method]?.params || [] , "id": id}, method, chain, methods[method]?.main || false]);
                continue
            }
            // Push the json rpc body, the name and the mainness in to the array
            if(!trust && !methods[method]?.trusted) requests.push([{"jsonrpc":"2.0","method": methods[method]?.name || "", "params" :methods[method]?.params || [] , "id": id}, method, chain, methods[method]?.main || false]);
        }

        return requests
    }

    prepareJSONRPCRequestsList(methods, id, chain, trust=false)
    {
        let rpc_methods = Object.keys(methods)
        let requests = []
        

        for(let method of rpc_methods) {
            // if rpc methods
            if(trust && methods[method]?.trusted) 
            {
                requests.push({"jsonrpc":"2.0","method": methods[method]?.name || "", "params" :methods[method]?.params || [] , "id": id});
                continue
            }
            // Push the json rpc body, the name and the mainness in to the array
            if(!trust && !methods[method]?.trusted) requests.push({"jsonrpc":"2.0","method": methods[method]?.name || "", "params" :methods[method]?.params || [] , "id": id});
        }

        return requests
    }

    async pingRequest(rpcURL, jsonRPCRequests){   
        let isAlive = false;
        let data = {}
        
        for(let jsonRPCRequest of jsonRPCRequests)
        {
            let [jsonRPC, method_name, chain, mainness] = jsonRPCRequest;
            data["chain"] = chain
            
            try
            {
                let jsonResponse = await got.post(rpcURL, {
                    json: jsonRPC,
                    timeout: {
                        request: Helpers.secondsToMilliseconds(this.configurations.max_http_timeout)                    
                    }
                }).json();
                
                // console.log(jsonResponse)
                
                data = {
                    ...data,
                    timeStamp: Helpers.millisecondsToSeconds(Date.now())
                }

                if(jsonResponse.result) data[method_name] = jsonResponse.result
                if(jsonResponse.error) data[method_name] = false
                
                if(mainness && jsonResponse.result) isAlive = true;
            }
            catch(err)
            {
                // console.log(err.response?.statusCode, err.code, err.url, err.message)
                if(mainness) isAlive = false
            }
        }
        
        if(isAlive) this.handleRPCResult(data)
        this.handleNodeStatus(rpcURL, isAlive,  data)
    }

    handleRPCResult(data)
    {
        // console.log(data.chain, data.lastest_eth_blockNumber, data.eth_blockNumber, this.max_block_behind, data.chain)
        let lastest_eth_blockNumber = parseInt(data?.lastest_eth_blockNumber, 16)
        let eth_blockNumber = parseInt(data?.eth_blockNumber, 16)
        
        if(lastest_eth_blockNumber && eth_blockNumber)
        {
            if(data.chain == "ethnodes") Helpers.isBlockWithRange(lastest_eth_blockNumber, eth_blockNumber, this.max_block_behind)
        }

        return data
    }

    saveAllNodesAndLevelsToRedis()
    {
        for(let chain of this.chains)
        {
            let urls = this.configurations.nodes[chain]?.url
            this.nodesJsonRPCUrl.push(...urls)
        }

        redisController.save("nodesJsonRPCUrl", JSON.stringify(this.nodesJsonRPCUrl))
        redisController.save("slaLevels", JSON.stringify(this.slaLevels))
    }

    async initConfigurations()
    {
        this.saveAllNodesAndLevelsToRedis()
    }

    handleNodeStatus(nodeName, isAlive, kwargs)
    {
        let status = {
            nodeName,
            isAlive,
            ...kwargs
        }
        
        logger.info(JSON.stringify(status))
        redisController.saveToList(nodeName, status)
    }

    runDailySLAClassifiers()
    {
        cron.schedule(`0 0 * * *`, async () => {
            console.log("Once in day")
            this.calculateSLA()
        })
    }

    async calculateSLA()
    {
        let results = {}
        let nodesJsonRPCUrl = await redisController.retrieveList("nodesJsonRPCUrl")
        for(let nodeJsonUrl of nodesJsonRPCUrl)
        {
            let nodeData = await redisController.retrieveList(nodeJsonUrl)
            let SLAPercent = this.calculateEachDowntime(nodeJsonUrl, nodeData)
            if(SLAPercent) results = {...results, ...SLAPercent}
            
            this.assignSLALevelsAndStore(results)
            // Clear out the stored nodes data
            if (this.clearAfterCompute) redisController.clear(nodeJsonUrl)

        }
    }

    calculateEachDowntime(nodeJsonUrl, nodeData)
    {
        /*
            It is assumed that the node was monitored for 24 hours which is 84,000 secs
            So to calculate the SLA, The formular would be 100 - (totalDownTime/84600 * 100)
        */
        if(!nodeData) return null;

        let isNotAliveMode = false;
        let totalDownTime = 0;
        let SLAPercent = 0.0;
        let lastAliveTimeStamp;

        for(let data of nodeData)
        {
            if(!data.isAlive && !isNotAliveMode)
            {
                isNotAliveMode = true;
                lastAliveTimeStamp = data.timeStamp
            }
            else if (data.isAlive && isNotAliveMode)
            {
                let timeStampOffSet = data.timeStamp - lastAliveTimeStamp
                totalDownTime += timeStampOffSet  
                isNotAliveMode = false
            }
        }
        SLAPercent = 100 - (totalDownTime/84600 * 100)
        
        let result = {}
        result[nodeJsonUrl] = SLAPercent
        
        return result 
    }

    assignSLALevelsAndStore(results)
    {
        let sla_levels = {};

        for(let node_result_key in results)
        {
            sla_levels[node_result_key] =  this.getSLALevel(results[node_result_key])    
        }

        this.saveSLALevels(sla_levels)
    }

    getSLALevel(value)
    {
        for(let i = 0; i <= this.slaLevels.length; i++)
        {
            if((i + 1) == this.slaLevels.length) break
            if(value >= this.slaLevels[i] && value <= this.slaLevels[i + 1]  ) return this.slaLevels[i]
        }
        
        return null
    }

    saveSLALevels(sla_levels)
    {
        redisController.save("computedNodeSlaLevels", JSON.stringify(sla_levels))
    }

    cacheVerificationResponse(key, response)
    {
        redisController.save(key, response)
    }
 
    async integrityCheck(rpcUrls, jsonRPCRequests)
    {
        for(let url of rpcUrls)
        {
            let jsonResponse = await got.post(url, {
                json: jsonRPCRequests,
            }).json();

            let getCachedResponse = redisController.retrieve(url)
            
            if(getCachedResponse)
            {
                if(getCachedResponse == jsonResponse) 
                {
                    console.log("verification true for node ", url)
                }
                else
                {
                    console.log("verification failed for node ", url)
                }
            }
            else
            {
                redisController.saveList(jsonResponse)
            }
        }
    }
}