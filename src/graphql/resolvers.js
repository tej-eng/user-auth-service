const { PrismaClient } = require("@prisma/client");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../config/jwt");
const { generateOtp } = require("../utils/otp");
const redis = require("../config/redis");
const cookie = require("cookie");

const {
  OTP_EXPIRY,
  OTP_RATE_LIMIT,
  OTP_RATE_WINDOW,
} = require("../config/redisConstants");

const prisma = new PrismaClient();

module.exports = {
  Query: {
    // ================= GET USERS (ADMIN ONLY) =================
    getUsersDetails: async (_, { page = 1, limit = 10 }, context) => {
      if (!context.user || context.user.role !== "ADMIN") {
        throw new Error("Admin only");
      }

      const skip = (page - 1) * limit;

      const [users, totalCount] = await Promise.all([
        prisma.user.findMany({
          skip,
          take: limit,
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.user.count(),
      ]);

      return {
        data: users,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

     me: async (_, __, { user }) => {
      if (!user) return null;

      return await prisma.user.findUnique({
        where: { id: user.id },
      });
    },

 
  },


  Mutation: {
    // ================= REQUEST OTP =================
    requestOtp: async (_, { mobile }) => {
      if (!mobile) throw new Error("Mobile required");

      // Optional: check if deleted user exists
      const existingUser = await prisma.user.findUnique({ where: { mobile } });
      if (existingUser?.isDeleted) {
        throw new Error("Account deleted");
      }

      // Rate limiting
      const rateKey = `otp_rate:${mobile}`;
      const count = await redis.incr(rateKey);

      if (count === 1) {
        await redis.expire(rateKey, OTP_RATE_WINDOW);
      }

      if (count > OTP_RATE_LIMIT) {
        throw new Error("Too many OTP requests");
      }

      const otp = generateOtp();

      await redis.set(`otp:${mobile}`, otp, "EX", OTP_EXPIRY);

      console.log("Generated OTP:", otp);

      return true;
    },

    // ================= AUTH WITH OTP =================
    authWithOtp: async (_, { mobile, otp }, { res }) => {
      if (!mobile) throw new Error("Mobile required");
      if (!otp) throw new Error("OTP required");

      const alreadyUsed = await redis.get(`otp_used:${mobile}:${otp}`);
      if (alreadyUsed) throw new Error("OTP already used");

      const storedOtp = await redis.get(`otp:${mobile}`);
      if (!storedOtp) throw new Error("OTP expired or not requested");
      if (storedOtp !== otp) throw new Error("Invalid OTP");

      // Mark OTP used
      await redis.set(`otp_used:${mobile}:${otp}`, "1", "EX", 300);
      await redis.del(`otp:${mobile}`);

      // 🔥 Now create or fetch user AFTER OTP verification
      let user = await prisma.user.findUnique({ where: { mobile } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            mobile,
            isActive: true,
            isDeleted: false,
          },
        });
      }

      if (user.isDeleted) throw new Error("Account deleted");
      if (!user.isActive) throw new Error("Account inactive");

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken },
      });

      if (res?.setHeader) {
        res.setHeader("Set-Cookie", [
          cookie.serialize("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 60 * 15,
            path: "/",
          }),
          cookie.serialize("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
          }),
        ]);
      }

      return { user, accessToken, refreshToken };
    },

    // ================= REFRESH TOKEN =================
    refreshToken: async (_, { token }, { res }) => {
      if (!token) throw new Error("Refresh token required");
      const decoded = verifyRefreshToken(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user || user.refreshToken !== token) throw new Error("Invalid refresh token");

      const newAccess = generateAccessToken(user);
      const newRefresh = generateRefreshToken(user);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefresh },
      });

      if (res?.setHeader) {
        res.setHeader("Set-Cookie", [
          cookie.serialize("accessToken", newAccess, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 60 * 15,
            path: "/",
          }),
          cookie.serialize("refreshToken", newRefresh, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
          }),
        ]);
      }

      return { user, accessToken: newAccess, refreshToken: newRefresh };
    },

    // ================= LOGOUT =================
    logout: async (_, __, { user, res }) => {
      if (!user) throw new Error("Unauthorized");

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });

      if (res?.setHeader) {
        res.setHeader("Set-Cookie", [
          cookie.serialize("accessToken", "", {
            httpOnly: true,
            expires: new Date(0),
            path: "/",
          }),
          cookie.serialize("refreshToken", "", {
            httpOnly: true,
            expires: new Date(0),
            path: "/",
          }),
        ]);
      }

      return true;
    },




  },
};
