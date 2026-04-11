// src/config/redis.js
require("dotenv").config();
const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  username: process.env.REDIS_USERNAME,   
  password: process.env.REDIS_PASSWORD,   
  
});

redis.on("error", (err) => console.error("Redis Error:", err));

(async () => {
  await redis.connect();
  console.log("Redis Connected ✅");
})();

module.exports = redis;