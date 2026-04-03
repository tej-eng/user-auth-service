const prisma = require("../config/prisma");
const redis = require("../config/redis");
const cookie = require("cookie");
const { sendOTPService, verifyOTPService, refreshTokenService } = require("../services/authService");
const { connectMongo, getDb } = require("../config/mongo");
const { v4: uuidv4 } = require("uuid");
const GraphQLJSON = require("graphql-type-json");

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
  JSON: GraphQLJSON,
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
getUserWalletTransactions: async (_, { filter }, context) => {
  try {
    if (!context.user) throw new Error("Unauthorized");

    const {
      page = 1,
      limit = 10,
      type,
      fromDate,
      toDate,
    } = filter || {};

    const skip = (page - 1) * limit;

    const wallet = await prisma.userWallet.findUnique({
      where: { userId: context.user.id },
    });

    if (!wallet) throw new Error("Wallet not found");

    const where = {
      userWalletId: wallet.id,

      // HANDLE MULTIPLE TYPES
      ...(type && type.length > 0
        ? {
            type: {
              in: type, // ["DEBIT", "CREDIT"]
            },
          }
        : {}),

      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate && { gte: new Date(fromDate) }),
              ...(toDate && { lte: new Date(toDate) }),
            },
          }
        : {}),
    };

    const [transactions, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        include: {
          session: {
            include: {
              astrologer: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),

      prisma.walletTransaction.count({ where }),
    ]);

    const formatted = transactions.map((t) => ({
      id: t.id,
      userWalletId: t.userWalletId,
      astrologerWalletId: t.astrologerWalletId,
      rechargePackId: t.rechargePackId,
      sessionId: t.sessionId,

      type: t.type,
      coins: t.coins,
      amount: t.amount,
      description: t.description,

      astrologerName:
        t.type === "DEBIT"
          ? t.session?.astrologer?.name || ""
          : "",

      createdAt: t.createdAt,
    }));

    return {
      data: formatted,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    };
  } catch (error) {
    console.error("getUserWalletTransactions error:", error);
    throw new Error(error.message);
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

getUserChatHistory: async (_, { page = 1, limit = 10 }, context) => {
  try {
    if (!context.user) throw new Error("Unauthorized");

    const userId = context.user.id;
    const skip = (page - 1) * limit;

    //  Get distinct rooms
    const rooms = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      select: {
        roomId: true,
      },
      distinct: ["roomId"],
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const roomIds = rooms.map(r => r.roomId);

    if (!roomIds.length) return [];

    //  Get last messages in bulk
    const lastMessages = await prisma.message.findMany({
      where: {
        roomId: { in: roomIds },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map latest message per room
    const lastMessageMap = {};
    for (const msg of lastMessages) {
      if (!lastMessageMap[msg.roomId]) {
        lastMessageMap[msg.roomId] = msg;
      }
    }

    //  Get sessionIds (filter valid ones)
    const sessionIds = Object.values(lastMessageMap)
      .map(m => m.sessionId)
      .filter(Boolean);

    // Fetch sessions in ONE query
    let sessions = [];
    if (sessionIds.length) {
      sessions = await prisma.session.findMany({
        where: {
          id: { in: sessionIds },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              mobile: true,
            },
          },
          astrologer: {
            select: {
              id: true,
              name: true,
              profilePic: true,
              experience: true,
              price: true,
            },
          },
        },
      });
    }

    const sessionMap = {};
    sessions.forEach(s => {
      sessionMap[s.id] = s;
    });

    // Final response
    const chats = roomIds.map((roomId) => {
      const lastMessage = lastMessageMap[roomId];
      let session = null;

      // Primary: sessionId
      if (lastMessage?.sessionId) {
        session = sessionMap[lastMessage.sessionId] || null;
      }

      return {
        roomId,
        sessionId: session?.id || null,
        startedAt: session?.startedAt || null,
        endedAt: session?.endedAt || null,
        status: session?.status || null,

        user: session?.user || null,
        astrologer: session?.astrologer || null,

        lastMessage: lastMessage || null,
      };
    });

    return chats;

  } catch (error) {
    console.error("getUserChatHistory error:", error);
    throw new Error(error.message || "Failed to fetch chat history");
  }
},

getUserSessions: async (_, { filter }, context) => {
  try {
    if (!context.user) throw new Error("Unauthorized");

    const userId = context.user.id;

    const {
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = filter || {};

    const skip = (page - 1) * limit;

    //  Build dynamic where condition
    const where = {
      userId,
      ...(status && { status }),

      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate && { gte: new Date(fromDate) }),
              ...(toDate && { lte: new Date(toDate) }),
            },
          }
        : {}),
    };

    //  Fetch sessions + count
    const [sessions, totalCount] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          user: {
            select: { name: true },
          },
          astrologer: {
            select: { name: true, profilePic: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),

      prisma.session.count({ where }),
    ]);

    //  Transform response
    const formatted = sessions.map((s) => {
      const ratePerSecond = s.ratePerMin / 60;

      return {
        id: s.id,
        userName: s.user?.name || "",
        astrologerName: s.astrologer?.name || "",
        astrologerImage: s.astrologer?.profilePic || "",

        status: s.status,

        startedAt: s.startedAt,
        endedAt: s.endedAt,

        durationSec: s.durationSec,
        durationMin: Math.ceil(s.durationSec / 60),

        ratePerMin: s.ratePerMin,
        ratePerSecond: Number(ratePerSecond.toFixed(2)),

        totalCharge: s.coinsDeducted,
        coinsEarned: s.coinsEarned,
        commission: s.commission,
      };
    });

    return {
      data: formatted,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    };

  } catch (error) {
    console.error("getUserSessions error:", error);
    throw new Error(error.message || "Failed to fetch sessions");
  }
},

// getNextChatRequest: async (_, { astrologerId }) => {

//   const request = await redis.lindex(
//     `chat_queue:${astrologerId}`,
//     0
//   );

//   if (!request) return null;

//   return JSON.parse(request);
// },
// skipChatRequest: async (_, { astrologerId }) => {

//   await redis.lpop(`chat_queue:${astrologerId}`);

//   return true;
// },



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
        maxAge:  1 * 24 * 60 * 60 * 1000, //for testing 1 day, can be changed to 15 * 60 * 1000 for 15 mins in production
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

  //  Generate Room ID
  const roomId = uuidv4();

  // Get User Wallet
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true }
  });

  if (!user || !user.wallet) {
    throw new Error("Wallet not found");
  }

  const walletBalance = user.wallet.balanceCoins || 0;

  //  Get Astrologer Price
  const astrologer = await prisma.astrologer.findUnique({
    where: { id: input.astrologerId }
  });

  if (!astrologer) {
    throw new Error("Astrologer not found");
  }

  const pricePerMin = astrologer.price || 1;

  // Calculate Chat Time
  const chatTime = Math.floor(walletBalance / pricePerMin);

  if (chatTime <= 0) {
    throw new Error("Insufficient balance");
  }

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

  const queueData = {
      user_id: userId,
      astrologerId: input.astrologerId,
      userName: input.name,
      countryCode: input.countryCode,
      mobile: input.mobile,
      gender: input.gender,
      dateOfBirth: new Date(input.birthDate),
      timeOfBirth: input.birthTime,
      occupation: input.occupation,
      location: input.birthPlace,
      astro_id: "156983", // for testing with fixed astrologer, can be changed to input.astrologerId in production
      is_promotional: false,  
      room_id: roomId,
      maximum_time: chatTime,
      user_image: user.profilePic || "",
      phoneNumber: `${input.countryCode}${input.mobile}`,
      createdAt: Date.now()
  };
  
  const exists = await redis.exists(`chat_request_data:${roomId}`);
 if (exists) return;
  await redis.set(
    `chat_request_data:${roomId}`,
    JSON.stringify(queueData),
    "EX",
    7200 //hours to expire, in case something goes wrong with the queue processing, we don't want stale data hanging around forever
  );

  // await redis.rpush(
  //   `chat_queue:${input.astrologerId}`,
  //   roomId
  // );

  await redis.rpush(
    `chat_queue:156983`, // for testing with fixed astrologer, can be changed to input.astrologerId in production
    roomId
  );

  //  Return Response
  return {
    roomId,
    chatTime,
    intakeId: intake.id
  };
},
createReview: async (_, { input }, context) => {
  const userId = context.user.id;

  const {
    astro_id,
    review_id, // roomId or sessionId
    star,
    comment,
    user_name,
    astro_name,
  } = input;

  //  Optional: find session using roomId
  const session = await prisma.session.findFirst({
    where: {
      userId,
      astrologerId: astro_id,
      status: "COMPLETED"
    },
    orderBy: { createdAt: "desc" }
  });

  //  Prevent duplicate review
  const existing = await prisma.review.findFirst({
    where: {
      userId,
      astrologerId: astro_id,
      sessionId: session?.id
    }
  });

  if (existing) {
    throw new Error("Review already submitted");
  }

  //  Create Review
  const review = await prisma.review.create({
    data: {
      userId,
      astrologerId: astro_id,
      sessionId: session?.id || null,
      rating: star,
      comment,
      userName: user_name,
      astroName: astro_name
    }
  });

  //  Update astrologer average rating
  const allReviews = await prisma.review.aggregate({
    where: { astrologerId: astro_id },
    _avg: { rating: true }
  });

  await prisma.astrologer.update({
    where: { id: astro_id },
    data: {
      rating: allReviews._avg.rating || 0
    }
  });

  return {
    success: true,
    message: "Review submitted successfully",
    review
  };
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