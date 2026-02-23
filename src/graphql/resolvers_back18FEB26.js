const bcrypt = require("bcryptjs");
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
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW,
} = require("../config/redisConstants");

const prisma = new PrismaClient();

module.exports = {
  Query: {
    getUsersDetails: async (_, __, context) => {
      if (!context.user) {
        throw new Error("Unauthorized");
      }
       
       const users = await prisma.user.findMany();
      return users;
    },
  },

  Mutation: {
    // ================= SIGNUP =================
    signupUser: async (_, args) => createUser(args, "USER"),
    signupAstrologer: async (_, args) => createUser(args, "ASTROLOGER"),

    // ================= REQUEST OTP =================
    requestOtp: async (_, { mobile }) => {
      if (!mobile) throw new Error("Mobile required");

      const user = await prisma.user.findUnique({
        where: { mobile },
      });

      if (!user || user.isDeleted) {
        throw new Error("User not found");
      }
      const rateKey = `otp_rate:${mobile}`;
      const count = await redis.incr(rateKey);

      if (count === 1) {
        await redis.expire(rateKey, OTP_RATE_WINDOW);
      }

      if (count > OTP_RATE_LIMIT) {
        throw new Error("Too many OTP requests. Try later.");
      }

      const otp = generateOtp();
      await redis.set(`otp:${mobile}`, otp, "EX", OTP_EXPIRY);
      console.log("Generated OTP:", otp);

      return true;
    },

    // ================= LOGIN =================
    login: async (_, { email, mobile, password, otp }, { res }) => {
      if (!email && !mobile) {
        throw new Error("Email or mobile required");
      }

      if (!password && !otp) {
        throw new Error("Password or OTP required");
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            email ? { email } : undefined,
            mobile ? { mobile } : undefined,
          ].filter(Boolean),
        },
      });

      if (!user || user.isDeleted) {
        throw new Error("User not found");
      }
      if (!user.isActive) {
        throw new Error("Account inactive");
      }
      const identifier = user.mobile || user.email;
      const attemptKey = `login_fail:${identifier}`;
      const attempts = await redis.get(attemptKey);

      if (attempts && Number(attempts) >= LOGIN_ATTEMPT_LIMIT) {
        throw new Error("Too many failed attempts. Try later.");
      }

      // ===== PASSWORD LOGIN =====
      if (password) {
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
          await trackLoginFail(attemptKey);
          throw new Error("Invalid credentials");
        }
      }

      // ===== OTP LOGIN =====
      if (otp) {
        const storedOtp = await redis.get(`otp:${user.mobile}`);

        if (!storedOtp) {
          throw new Error("Invalid OTP");
        }
        if (storedOtp !== otp) {
          await trackLoginFail(attemptKey);
          throw new Error("Invalid OTP");
        }
        await redis.del(`otp:${user.mobile}`);
      }

      // Clear failed attempts after success
      console.log("------attemptKey-------",attemptKey);
      await redis.del(attemptKey);

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
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || user.refreshToken !== token) {
        throw new Error("Invalid refresh token");
      }
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
        where: {id: user.id},
        data: { refreshToken: null },
      });
      await redis.del(`login_fail:${user.mobile || user.email}`);
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

// ================= HELPERS =================

async function createUser(args, role) {
  const hashed = await bcrypt.hash(args.password, 10);

  return prisma.user.create({
    data: {
      name: args.name,
      email: args.email,
      mobile: args.mobile,
      password: hashed,
      role,
      isActive: true,
      isDeleted: false,
    },
  });
}

async function trackLoginFail(key) {
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, LOGIN_ATTEMPT_WINDOW);
  }
}
