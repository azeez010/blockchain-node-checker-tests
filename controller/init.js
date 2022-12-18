import redis from "redis";
import winston from "winston";

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    }));
}


export const redisClient = redis.createClient();
(
    async() =>
    {
        redisClient.on("error", (error) => console.error(`Error : ${error}`));
        redisClient.on("connect", (success) => console.log(`Redis connection sucessfully established`));
        
        await redisClient.connect();
    }
)()


