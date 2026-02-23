import prisma from "../config/prisma.js";
import redis from "../config/redis.js";
import { generateOTP } from "../utils/otp.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../config/jwt.js";

const OTP_EXPIRE = 300; // 5 minutes
const OTP_LIMIT = 3; // 3 per 10 min
const LOGIN_LIMIT = 5; // 5 failed attempts

export const sendOTPService = async (phone) => {
  const rateKey = `otp_rate:${phone}`;
  const count = await redis.incr(rateKey);

  if (count === 1) await redis.expire(rateKey, 600);

  if (count > OTP_LIMIT)
    throw new Error("Too many OTP requests. Try later.");

  const otp = generateOTP();

  await redis.set(`otp:${phone}`, otp, "EX", OTP_EXPIRE);

  console.log("📲 OTP:", otp); // Replace with SMS API

  return "OTP sent successfully";
};

export const verifyOTPService = async (phone, otp) => {
  const storedOTP = await redis.get(`otp:${phone}`);

  if (!storedOTP || storedOTP !== otp) {
    const failKey = `login_fail:${phone}`;
    const fails = await redis.incr(failKey);
    if (fails === 1) await redis.expire(failKey, 900);

    if (fails > LOGIN_LIMIT)
      throw new Error("Too many failed attempts.");

    throw new Error("Invalid OTP");
  }

  await redis.del(`otp:${phone}`);
  await redis.del(`login_fail:${phone}`);

  let user = await prisma.user.findUnique({
    where: { phone },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { phone },
    });
  }

  if (user.isDeleted) throw new Error("Account deleted");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  return { accessToken, refreshToken, user };
};

export const refreshTokenService = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });

  if (!user || user.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccess = generateAccessToken(user);
  const newRefresh = generateRefreshToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefresh },
  });

  return { accessToken: newAccess, refreshToken: newRefresh, user };
};

