import yaml from "yaml";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import sleep from "sleep-promise"
import { redisClient } from "./init.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Helpers
{
    static secondsToMilliseconds(seconds)
    {
        return seconds * 1000
    }

    static millisecondsToSeconds(milliSeconds)
    {
        return Math.floor(milliSeconds / 1000)
    }

    static isBlockWithRange(latestBlockNumber, lastBlockNumber, MAX_BLOCKS_BEHIND)
    {
        if((latestBlockNumber - lastBlockNumber) > MAX_BLOCKS_BEHIND) return true;
        return false
    }

    static generateRandom(min, max)
    {
        return Math.floor(
            Math.random() * (max - min + 1) + min
        )
    }

    static generateRandomSleepMilliSeconds(min, max){  
        
        return this.generateRandom(min, max) * 1000 
    }

    static isCoinFlipTailOrHead()
    {
        if(this.generateRandom(0, 1)) return true;
        return false;
    }

    static weiToEther(wei)
    {
        return parseInt(wei, "16") / 1e18
    }

    static async entropinessStrategy(min, max)    
    {
        let randomMilliseconds = this.generateRandomSleepMilliSeconds(min, max)
        await sleep(randomMilliseconds)
        console.log(`Slept for ${randomMilliseconds / 1000 } seconds.`)
    }

    static toArrayAndSort(sla_levels)
    {
        let arr = []
        for(let sla of sla_levels)
        {
            arr.push(sla)
        }
        return this.msort(arr)
    }

    static msort(arr){
        for(var i =0;i<arr.length;i++){
            for(var j= i+1;j<arr.length;j++){
                if(arr[i]>arr[j]){
                    var swap = arr[i];
                    arr[i] = arr[j];
                    arr[j] = swap;
                }
            }
        }
    return arr;
    }
}

export class YAMLConfig{
  
    static fileName = path.resolve(__dirname, '..') + '\\config\\conf.yml'

    static read() 
    {
        const file = fs.readFileSync(this.fileName, 'utf8')
        const config = yaml.parse(file)
        return config
    }
}


export class redisController
{
    static async save(key, value)
    {
        await redisClient.set(key, value)
    }

    static async saveList(key, value)
    {
        await redisClient.set(key, JSON.stringify(value))
    }
    
    static async saveToList(key, value)
    {
        let savedList = await redisClient.get(key);
        
        if(savedList != null)
        {
            let parsedSavedList; 
            try{
                parsedSavedList = JSON.parse(savedList);
            }
            catch(e)
            {
                throw new Error("Saved data must be a json serializable")
            }
            this.savedParsedList(key, value, parsedSavedList)
        }
        else
        {
            this.savedParsedList(key, value)
        }
    }

    static async savedParsedList(key, value, parsedSavedList=[])
    {
        parsedSavedList.push(value);
        this.save(key, JSON.stringify(parsedSavedList))
    }

    static async retrieve(key)
    {
        return await redisClient.get(key)
    }

    static async retrieveList(key)
    {
        return JSON.parse(await redisClient.get(key))
    }

    static async clear(key)
    {
        await redisClient.clear(key)
    }
}