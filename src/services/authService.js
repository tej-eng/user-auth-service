const prisma = require("../config/prisma");
const redis = require("../config/redis");
const { generateOtp } = require("../utils/otp");
const { generateAccessToken, generateRefreshToken } = require("../config/jwt");
const jwt = require("jsonwebtoken");
const { connectMongo, getDb } = require("../config/mongo");

const OTP_EXPIRE = 300; // 5 minutes
const OTP_LIMIT = 3; // 3 per 10 min
const LOGIN_LIMIT = 5; // 5 failed attempts

// ================= LOG TO MONGO =================
async function logEvent(type, mobile, details = {}) {
  try {
    const db = await connectMongo();
    const collection = db.collection("userAuthLogs");

    await collection.insertOne({
      type,
      mobile,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
  }
}

// ================= SEND OTP =================
const sendOTPService = async (mobile) => {
  try {
 if (!/^\+[1-9]\d{5,14}$/.test(mobile)) {
  throw new Error("Invalid mobile number");
}

    const rateKey = `otp_rate:${mobile}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 600);
    if (count > OTP_LIMIT) throw new Error("Too many OTP requests. Try later.");

    const otp = generateOtp();
    console.log(`Generated OTP for ${mobile}: ${otp}`);
    await redis.set(`otp:${mobile}`, otp, "EX", OTP_EXPIRE);

    // Log OTP generation
    await logEvent("OTP_GENERATED", mobile, { otp });

    return "OTP sent successfully";
  } catch (error) {
    await logEvent("OTP_FAILED", mobile, { error: error.message });
    throw new Error(error.message || "Failed to send OTP");
  }
};

// ================= VERIFY OTP =================
const verifyOTPService = async (mobile, otp) => {
  try {
    const isUsed = await redis.get(`otp_used:${mobile}`);
    if (isUsed) {
      await logEvent("OTP_REUSED", mobile);
      throw new Error("OTP already used");
    }

    const storedOTP = await redis.get(`otp:${mobile}`);
    if (!storedOTP || storedOTP !== otp) {
      const failKey = `login_fail:${mobile}`;
      const fails = await redis.incr(failKey);
      if (fails === 1) await redis.expire(failKey, 900);
      if (fails > LOGIN_LIMIT) {
        await logEvent("LOGIN_FAILED_LIMIT", mobile);
        throw new Error("Too many failed attempts.");
      }

      await logEvent("OTP_INVALID", mobile, { enteredOtp: otp, storedOtp: storedOTP });
      throw new Error("Invalid OTP");
    }

    await redis.set(`otp_used:${mobile}`, "true", "EX", OTP_EXPIRE);
    await redis.del(`otp:${mobile}`);
    await redis.del(`login_fail:${mobile}`);

    let user = await prisma.user.findUnique({ where: { mobile } });
    if (!user) user = await prisma.user.create({ data: { mobile } });
    if (user.isDeleted) throw new Error("Account deleted");

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    // Log successful login
    await logEvent("LOGIN_SUCCESS", mobile, { userId: user.id });

    return { accessToken, refreshToken, user };
  } catch (error) {
    await logEvent("LOGIN_FAILED", mobile, { error: error.message });
    throw new Error(error.message || "Failed to verify OTP");
  }
};

// ================= REFRESH TOKEN =================
const refreshTokenService = async (token) => {
  try {
    if (!token) throw new Error("Refresh token required");

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new Error("Invalid refresh token");
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.refreshToken !== token) throw new Error("Invalid refresh token");

    const newAccess = generateAccessToken(user);
    const newRefresh = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefresh },
    });

    await logEvent("TOKEN_REFRESHED", user.mobile, { userId: user.id });

    return { accessToken: newAccess, refreshToken: newRefresh, user };
  } catch (error) {
    await logEvent("TOKEN_REFRESH_FAILED", null, { error: error.message });
    throw new Error(error.message || "Failed to refresh token");
  }
};

module.exports = {
  sendOTPService,
  verifyOTPService,
  refreshTokenService,
};