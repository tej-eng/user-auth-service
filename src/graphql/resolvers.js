const prisma = require("../config/prisma");
const redis = require("../config/redis");
const cookie = require("cookie");
const { sendOTPService, verifyOTPService, refreshTokenService } = require("../services/authService");
const { connectMongo, getDb } = require("../config/mongo");
const { v4: uuidv4 } = require("uuid");

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
      ? {
          OR: [
            { mobile: { contains: search, mode: "insensitive" } },
            { countryCode: { contains: search, mode: "insensitive" } },
          ],
        }
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
getUserWallet: async (_, __, context) => {
  try {
    if (!context.user) {
      throw new Error("Unauthorized");
    }

    const wallet = await prisma.userWallet.findUnique({
      where: {
        userId: context.user.id,
      },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    return wallet;
  } catch (error) {
    throw new Error(error.message || "Failed to fetch wallet");
  }
},
getUserProfile: async (_, __, context) => {
  try {
    if (!context.user) {
      throw new Error("Unauthorized. Please login.");
    }

    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: {
        id: true,
        name: true,
        mobile: true,
        countryCode: true,
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
  } catch (error) {
    throw new Error(error.message || "Failed to fetch user profile");
  }
},
getWalletTransactions: async (_, { page = 1, limit = 10 }, context) => {
  try {
    if (!context.user) {
      throw new Error("Unauthorized");
    }

    const skip = (page - 1) * limit;

    // 1 Get user's wallet
    const wallet = await prisma.userWallet.findUnique({
      where: { userId: context.user.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // 2️ Fetch transactions
    const [transactions, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: {
          userWalletId: wallet.id,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.count({
        where: {
          userWalletId: wallet.id,
        },
      }),
    ]);

    return {
      data: transactions,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    };
  } catch (error) {
    throw new Error(error.message || "Failed to fetch transactions");
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
    include: {
      wallet: true
    }
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
},
 getAstrologerById: async (_, { id }, { context }) => {

  console.log("Incoming ID:", id);
  //console.log("Context User:", context.user);

  const astrologer = await prisma.astrologer.findUnique({
    where: { id },
  });

  console.log("Astrologer Found:", astrologer);

  return astrologer;
},
getNextChatRequest: async (_, { astrologerId }) => {

  const request = await redis.lindex(
    `chat_queue:${astrologerId}`,
    0
  );

  if (!request) return null;

  return JSON.parse(request);
},
skipChatRequest: async (_, { astrologerId }) => {

  await redis.lpop(`chat_queue:${astrologerId}`);

  return true;
},



  },

  Mutation: {
    requestOtp: async (_, { countryCode, mobile }) => {
  try {
    if (!countryCode || !mobile) {
      throw new Error("Country code and mobile required");
    }

    const result = await sendOTPService(countryCode, mobile);

    await logEvent({
      action: "REQUEST_OTP",
      details: { countryCode, mobile },
    });

    return result;
  } catch (error) {
    throw new Error(error.message || "Failed to request OTP");
  }
},

  authWithOtp: async (_, { countryCode, mobile, otp }, { res }) => {
  try {
    if (!countryCode || !mobile) throw new Error("Country code and mobile required");
    if (!otp) throw new Error("OTP required");

    const { accessToken, refreshToken, user, isNewUser, hasName } =
      await verifyOTPService(countryCode, mobile, otp);

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
      details: { countryCode, mobile },
    });

    return { user, accessToken, refreshToken, isNewUser, hasName };

  } catch (error) {
    await logEvent({
      action: "FAILED_LOGIN_OTP",
      details: { countryCode, mobile, error: error.message },
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
  const userId = context.user.id;

  // 1️⃣ Generate Room ID
  const roomId = uuidv4();

  // 2️⃣ Get User Wallet
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true }
  });

  if (!user || !user.wallet) {
    throw new Error("Wallet not found");
  }

  const walletBalance = user.wallet.balanceCoins || 0;

  // 3️⃣ Get Astrologer Price
  const astrologer = await prisma.astrologer.findUnique({
    where: { id: input.astrologerId }
  });

  if (!astrologer) {
    throw new Error("Astrologer not found");
  }

  const pricePerMin = astrologer.price || 1;

  // 4️⃣ Calculate Chat Time
  const chatTime = Math.floor(walletBalance / pricePerMin);

  if (chatTime <= 0) {
    throw new Error("Insufficient balance");
  }

  // 5️⃣ Create Intake
  const intake = await prisma.intake.create({
    data: {
      userId,
      astrologerId: input.astrologerId,
      name: input.name,
      countryCode: input.countryCode,
      mobile: input.mobile,
      gender: input.gender,
      birthDate: new Date(input.birthDate),
      birthTime: input.birthTime,
      occupation: input.occupation,
      birthPlace: input.birthPlace,
      requestType: input.requestType,
      chatId: roomId
    }
  });

  //  Push to Redis Queue
  const queueData = {
    roomId,
    userId,
    astrologerId: input.astrologerId,
    chatTime, 
    createdAt: Date.now()
  };

  await redis.rpush(
    `chat_queue:${input.astrologerId}`,
    JSON.stringify(queueData)
  );

  //  Return Response
  return {
    roomId,
    chatTime,
    intakeId: intake.id
  };
},
acceptChatRequest: async (_, { roomId }, context) => {

  const intake = await prisma.intake.findFirst({
    where: { chatId: roomId }
  });

  if (!intake) {
    throw new Error("Chat request not found");
  }

  const astrologer = await prisma.astrologer.findUnique({
    where: { id: intake.astrologerId }
  });

  const session = await prisma.session.create({
    data: {
      userId: intake.userId,
      astrologerId: intake.astrologerId,
      type: "CHAT",
      status: "ONGOING",
      ratePerMin: Math.round(astrologer.price),
      startedAt: new Date()
    }
  });

  // remove first request from queue
  await redis.lpop(`chat_queue:${intake.astrologerId}`);

  // store active chat
  await redis.set(
    `active_chat:${roomId}`,
    JSON.stringify({
      sessionId: session.id,
      userId: intake.userId,
      astrologerId: intake.astrologerId,
      startTime: Date.now()
    })
  );

  return session;
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