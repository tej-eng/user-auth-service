const prisma = require("../config/prisma");
const redis = require("../config/redis");
const cookie = require("cookie");
const { sendOTPService, verifyOTPService, refreshTokenService } = require("../services/authService");
const { connectMongo, getDb } = require("../config/mongo");

// Helper to log events in MongoDB
async function logEvent({ userId, action, details }) {
  try {
    const db = await connectMongo();
    const collection = db.collection("userAuthLogs");
    await collection.insertOne({
      userId: userId || null,
      action,
      details: details || {},
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to log event:", error.message);
  }
}

module.exports = {
  Query: {
    getUsersDetails: async (_, { page = 1, limit = 10, search = "" }, context) => {
      try {
        const skip = (page - 1) * limit;
        const whereCondition = search
          ? { mobile: { contains: search, mode: "insensitive" } }
          : {};

        const [users, totalCount] = await Promise.all([
          prisma.user.findMany({
            where: whereCondition,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
          }),
          prisma.user.count({ where: whereCondition }),
        ]);

        return {
          data: users,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        throw new Error(error.message || "Failed to fetch users");
      }
    },

    getAstrologerListBySearch: async (_, { searchInput }) => {
      try {
        const { query, sortField, sortOrder, limit = 10, page = 1 } = searchInput || {};
        const skip = (page - 1) * limit;

        let orderBy = { createdAt: "desc" };
        if (sortField) {
          const sortMap = { EXPERIENCE: "experience", PRICE: "price", RATING: "rating" };
          if (sortMap[sortField]) {
            orderBy = { [sortMap[sortField]]: sortOrder === "ASC" ? "asc" : "desc" };
          }
        }

        const where = {
          approvalStatus: "APPROVED",
          ...(query && {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { skills: { has: query } },
              { languages: { has: query } },
            ],
          }),
        };

        const [astrologers, totalCount] = await Promise.all([
          prisma.astrologer.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: {
              id: true,
              profilePic: true,
              name: true,
              experience: true,
              price: true,
              rating: true,
              skills: true,
              languages: true,
            },
          }),
          prisma.astrologer.count({ where }),
        ]);

        return {
          data: astrologers,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        throw new Error(error.message || "Failed to fetch astrologer list");
      }
    },
  getRechargePacks: async (_, __, context) => {
  const packs = await prisma.rechargePack.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });

  return {
    data: packs,
    totalCount: packs.length,
  };
},

getRechargePackById: async (_, { id }, context) => {
      if (!context.user) {
        throw new Error("Unauthorized");
      }
      return await prisma.rechargePack.findUnique({
        where: { id },
      });
    },

me: async (_, __, { user }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      return await prisma.user.findUnique({
        where: { id: user.id },
      });
    },

  getUserById: async (_, { id }, context) => {
  if (!context.user) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      mobile: true,
      gender: true,
      birthDate: true,
      birthTime: true,
      occupation: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
},

  },

  Mutation: {
    requestOtp: async (_, { mobile }) => {
      try {
        if (!mobile) throw new Error("Mobile required");

        const result = await sendOTPService(mobile);

        // Log OTP request
        await logEvent({ action: "REQUEST_OTP", details: { mobile } });

        return result;
      } catch (error) {
        throw new Error(error.message || "Failed to request OTP");
      }
    },

  authWithOtp: async (_, { mobile, otp }, { res }) => {
  try {
    if (!mobile) throw new Error("Mobile required");
    if (!otp) throw new Error("OTP required");

    const { accessToken, refreshToken, user, isNewUser, hasName } =
      await verifyOTPService(mobile, otp);

    if (res?.setHeader) {
      res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".dhwaniastro.com",
      maxAge: 15 * 60 * 1000,
      path: "/",
      });

      res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".dhwaniastro.com",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
      });
    }

    await logEvent({
      userId: user.id,
      action: "LOGIN_OTP",
      details: { mobile },
    });

    return { user, accessToken, refreshToken, isNewUser, hasName };

  } catch (error) {

    await logEvent({
      action: "FAILED_LOGIN_OTP",
      details: { mobile, error: error.message },
    });

    throw new Error(error.message || "Failed to authenticate with OTP");
  }
},

    refreshToken: async (_, { token }, { res }) => {
      try {
        if (!token) throw new Error("Refresh token required");

        const { accessToken, refreshToken, user } = await refreshTokenService(token);

        if (res?.setHeader) {
          res.setHeader("Set-Cookie", [
            cookie.serialize("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Strict", maxAge: 60 * 15, path: "/" }),
            cookie.serialize("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Strict", maxAge: 60 * 60 * 24 * 7, path: "/" }),
          ]);
        }

        await logEvent({ userId: user.id, action: "REFRESH_TOKEN" });

        return { user, accessToken, refreshToken };
      } catch (error) {
        throw new Error(error.message || "Invalid refresh token");
      }
    },

   updateUserProfile: async (_, { input }, context) => {
      if (!context.user) throw new Error("Unauthorized. Please login.");

      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: {
          name: input.name,
          gender: input.gender,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          birthTime: input.birthTime,
          occupation: input.occupation,
        },
      });
      await logEvent({ userId: context.user.id, action: "UPDATE_PROFILE", details: input });
      return updatedUser;
    },

    // intake for chat 

    createIntake: async (_, { input }, context) => {
      console.log("Creating intake with input:", context.user.id);
      // if (!context.user) {
      //   throw new Error("Unauthorized");
      // }

      const intake = await prisma.intake.create({
        data: {
          userId: context.user.id,
          astrologerId: input.astrologerId,
          name: input.name,
          mobile: input.mobile,
          gender: input.gender,
          birthDate: new Date(input.birthDate),
          birthTime: input.birthTime,
          occupation: input.occupation,
          birthPlace: input.birthPlace,
          requestType: input.requestType,
          chatId: input.chatId || null,
        },
      });

      return intake;
    },


    logout: async (_, __, { user, res }) => {
      try {
        if (!user) throw new Error("Unauthorized");

        await prisma.user.update({ where: { id: user.id }, data: { refreshToken: null } });

        if (res?.setHeader) {
          res.setHeader("Set-Cookie", [
            cookie.serialize("accessToken", "", { httpOnly: true, expires: new Date(0), path: "/" }),
            cookie.serialize("refreshToken", "", { httpOnly: true, expires: new Date(0), path: "/" }),
          ]);
        }

        // Log logout
        await logEvent({ userId: user.id, action: "LOGOUT" });

        return true;
      } catch (error) {
        throw new Error(error.message || "Failed to logout");
      }
    },
  },
};