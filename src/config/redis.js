// src/config/redis.js
require("dotenv").config();
const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST ,
  port: process.env.REDIS_PORT 
  // password: "your_password", // if needed
});

redis.on("connect", () => {
  console.log("ioredis Connected");
});

redis.on("error", (err) => {
  console.error("ioredis Error:", err);
});

module.exports = redis;
