const prisma = require("../config/prisma");
const redis = require("../config/redis");
const cookie = require("cookie");
const {
  sendOTPService,
  verifyOTPService,
  refreshTokenService,
} = require("../services/authService");
const { connectMongo, getDb } = require("../config/mongo");
const { v4: uuidv4 } = require("uuid");
const GraphQLJSON = require("graphql-type-json");
const path = require("path");
const fs = require("fs");
const { GraphQLUpload } = require("graphql-upload");
const { type } = require("os");
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
  Upload: GraphQLUpload,
  Query: {
    getUsersDetails: async (
      _,
      { page = 1, limit = 10, search = "" },
      context,
    ) => {
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
        //console.log("getUserWallet context:", context);
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const wallet = await prisma.userWallet.findUnique({
          where: {
            userId: context.user.id,
          },
        });

        if (!wallet) {
          console.log("Wallet not found for userId:", context.user.id);
          throw new Error("Wallet not found");
        }
        console.log("Wallet found:", wallet);
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

        const { page = 1, limit = 10, type, fromDate, toDate } = filter || {};

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
            t.type === "DEBIT" ? t.session?.astrologer?.name || "" : "",

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
        const {
          query,
          sortField,
          sortOrder,
          limit = 10,
          page = 1,
          type,
        } = searchInput || {};

        const skip = (page - 1) * limit;

        let orderBy = { createdAt: "desc" };

        if (sortField) {
          const sortMap = {
            EXPERIENCE: "experience",
            RATING: "rating",
          };

          if (sortMap[sortField]) {
            orderBy = {
              [sortMap[sortField]]: sortOrder === "ASC" ? "asc" : "desc",
            };
          }
        }

        const where = {
          ...(query && {
            OR: [
              {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                skills: {
                  has: query,
                },
              },
              {
                languages: {
                  has: query,
                },
              },
            ],
          }),
        };

        const [astrologers, totalCount] = await Promise.all([
          prisma.astrologer.findMany({
            where,
            orderBy,
            skip,
            take: limit,

            include: {
              pricing: {
                where: {
                  isActive: true,
                  ...(type && { type }),
                },
              },
            },
          }),

          prisma.astrologer.count({ where }),
        ]);

        const formattedData = astrologers.map((astro) => ({
          id: astro.id,
          profilePic: astro.profilePic,
          name: astro.name,
          experience: astro.experience,
          rating: astro.rating,
          skills: astro.skills,
          languages: astro.languages,

          pricing: astro.pricing.map((p) => ({
            type: p.type,
            price: p.price,
            offerPrice: p.offerPrice,
            commissionPercent: p.commissionPercent,
            isActive: p.isActive,
          })),
        }));

        return {
          data: formattedData,
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
          wallet: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      return user;
    },
    getAstrologerById: async (_, { id }) => {
      return await prisma.astrologer.findUnique({
        where: { id },
        include: {
          pricing: true,
        },
      });
    },
    getUserChatHistory: async (_, { filter = {} }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const {
          page = 1,
          limit = 10,
          astrologerName,
          status,
          startDate,
          endDate,
        } = filter;

        const userId = context.user.id;

        const skip = (page - 1) * limit;

        console.log("========== START =============");
        console.log("USER ID:", userId);
        console.log("FILTER:", filter);

        /* =========================================
       SESSION FILTER
    ========================================= */
        const sessionWhere = {
          userId,

          ...(status && {
            status,
          }),

          ...(startDate || endDate
            ? {
                createdAt: {
                  ...(startDate && {
                    gte: new Date(startDate),
                  }),

                  ...(endDate && {
                    lte: new Date(endDate),
                  }),
                },
              }
            : {}),

          ...(astrologerName && {
            astrologer: {
              name: {
                contains: astrologerName,
                mode: "insensitive",
              },
            },
          }),
        };

        console.log("SESSION WHERE:", sessionWhere);

        /* =========================================
       TOTAL COUNT
    ========================================= */
        const totalCount = await prisma.session.count({
          where: sessionWhere,
        });

        console.log("TOTAL COUNT:", totalCount);

        /* =========================================
       FETCH SESSIONS
    ========================================= */
        const sessions = await prisma.session.findMany({
          where: sessionWhere,

          include: {
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
                countryCode: true,
              },
            },

            astrologer: {
              select: {
                id: true,
                name: true,
                profilePic: true,
                experience: true,
                rating: true,
                skills: true,
                languages: true,

                pricing: {
                  where: {
                    isActive: true,
                  },

                  select: {
                    type: true,
                    price: true,
                    offerPrice: true,
                    commissionPercent: true,
                    isActive: true,
                  },
                },
              },
            },

            messages: {
              orderBy: {
                createdAt: "desc",
              },

              take: 1,

              select: {
                id: true,
                msgId: true,
                roomId: true,
                senderId: true,
                receiverId: true,
                message: true,
                image: true,
                sender: true,
                replyTo: true,
                createdAt: true,
              },
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          skip,
          take: limit,
        });

        console.log("FINAL SESSIONS:", sessions.length);

        /* =========================================
       SUMMARY
    ========================================= */
        let totalCoinsDeducted = 0;
        let totalCoinsEarned = 0;
        let totalCommission = 0;

        sessions.forEach((session) => {
          totalCoinsDeducted += session.coinsDeducted || 0;
          totalCoinsEarned += session.coinsEarned || 0;
          totalCommission += session.commission || 0;
        });

        /* =========================================
       RESPONSE DATA
    ========================================= */
        const data = sessions.map((session, index) => {
          const lastMessage = session.messages?.[0] || null;

          // duration in minutes
          let durationMinutes = 0;

          if (session.durationSec) {
            durationMinutes = Math.ceil(session.durationSec / 60);
          }

          // active pricing
          const activePricing =
            session.astrologer?.pricing?.find((p) => p.type === "CHAT") ||
            session.astrologer?.pricing?.[0];

          return {
            srNo: skip + index + 1,

            roomId: lastMessage?.roomId || null,

            sessionId: session.id,

            startedAt: session.startedAt
              ? session.startedAt.toISOString()
              : null,

            endedAt: session.endedAt ? session.endedAt.toISOString() : null,

            createdAt: session.createdAt
              ? session.createdAt.toISOString()
              : null,

            status: session.status,

            durationSec: session.durationSec || 0,

            durationMinutes,

            ratePerMin:
              session.ratePerMin ||
              activePricing?.offerPrice ||
              activePricing?.price ||
              0,

            coinsDeducted: session.coinsDeducted || 0,

            coinsEarned: session.coinsEarned || 0,

            commission: session.commission || 0,

            user: {
              id: session.user?.id,
              name: session.user?.name,
              mobile: session.user?.mobile,
              countryCode: session.user?.countryCode,
            },

            astrologer: {
              id: session.astrologer?.id,
              name: session.astrologer?.name,
              profilePic: session.astrologer?.profilePic,
              experience: session.astrologer?.experience,
              rating: session.astrologer?.rating,
              skills: session.astrologer?.skills,
              languages: session.astrologer?.languages,
            },

            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  msgId: lastMessage.msgId,
                  roomId: lastMessage.roomId,
                  senderId: lastMessage.senderId,
                  receiverId: lastMessage.receiverId,
                  sender: lastMessage.sender,
                  message: lastMessage.message,
                  image: lastMessage.image,
                  replyTo: lastMessage.replyTo,

                  createdAt: lastMessage.createdAt
                    ? lastMessage.createdAt.toISOString()
                    : null,
                }
              : null,
          };
        });

        console.log("========== END =============", data);

        return {
          success: true,

          summary: {
            totalCoinsDeducted,
            totalCoinsEarned,
            totalCommission,
            totalRecords: totalCount,
          },

          data,

          totalCount,

          currentPage: page,

          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        console.error("getUserChatHistory error:", error);

        throw new Error(error.message || "Failed to fetch chat history");
      }
    },
    getUserCallHistory: async (_, { filter = {} }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const {
          page = 1,
          limit = 10,
          astrologerName,
          status,
          startDate,
          endDate,
        } = filter;

        const userId = context.user.id;

        const skip = (page - 1) * limit;

        console.log("========== START CALL HISTORY =============");
        console.log("USER ID:", userId);
        console.log("FILTER:", filter);

        /* =========================================
       SESSION FILTER
    ========================================= */
        const sessionWhere = {
          userId,

          // ONLY CALL SESSIONS
          type: "CALL",

          ...(status && {
            status,
          }),

          ...(startDate || endDate
            ? {
                createdAt: {
                  ...(startDate && {
                    gte: new Date(startDate),
                  }),

                  ...(endDate && {
                    lte: new Date(endDate),
                  }),
                },
              }
            : {}),

          ...(astrologerName && {
            astrologer: {
              name: {
                contains: astrologerName,
                mode: "insensitive",
              },
            },
          }),
        };

        console.log("SESSION WHERE:", sessionWhere);

        /* =========================================
       TOTAL COUNT
    ========================================= */
        const totalCount = await prisma.session.count({
          where: sessionWhere,
        });

        console.log("TOTAL COUNT:", totalCount);

        /* =========================================
       FETCH SESSIONS
    ========================================= */
        const sessions = await prisma.session.findMany({
          where: sessionWhere,

          include: {
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
                countryCode: true,
              },
            },

            astrologer: {
              select: {
                id: true,
                name: true,
                profilePic: true,
                experience: true,
                rating: true,
                skills: true,
                languages: true,

                pricing: {
                  where: {
                    isActive: true,
                  },

                  select: {
                    type: true,
                    price: true,
                    offerPrice: true,
                    commissionPercent: true,
                    isActive: true,
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          skip,
          take: limit,
        });

        console.log("FINAL CALL SESSIONS:", sessions.length);

        /* =========================================
       SUMMARY
    ========================================= */
        let totalCoinsDeducted = 0;
        let totalCoinsEarned = 0;
        let totalCommission = 0;

        sessions.forEach((session) => {
          totalCoinsDeducted += session.coinsDeducted || 0;
          totalCoinsEarned += session.coinsEarned || 0;
          totalCommission += session.commission || 0;
        });

        /* =========================================
       RESPONSE DATA
    ========================================= */
        const data = sessions.map((session, index) => {
          // duration in minutes
          let durationMinutes = 0;

          if (session.durationSec) {
            durationMinutes = Math.ceil(session.durationSec / 60);
          }

          // active pricing
          const activePricing =
            session.astrologer?.pricing?.find((p) => p.type === "CALL") ||
            session.astrologer?.pricing?.[0];

          return {
            srNo: skip + index + 1,

            sessionId: session.id,

            startedAt: session.startedAt
              ? session.startedAt.toISOString()
              : null,

            endedAt: session.endedAt ? session.endedAt.toISOString() : null,

            createdAt: session.createdAt
              ? session.createdAt.toISOString()
              : null,

            status: session.status,

            durationSec: session.durationSec || 0,

            durationMinutes,

            ratePerMin:
              session.ratePerMin ||
              activePricing?.offerPrice ||
              activePricing?.price ||
              0,

            coinsDeducted: session.coinsDeducted || 0,

            coinsEarned: session.coinsEarned || 0,

            commission: session.commission || 0,

            user: {
              id: session.user?.id,
              name: session.user?.name,
              mobile: session.user?.mobile,
              countryCode: session.user?.countryCode,
            },

            astrologer: {
              id: session.astrologer?.id,
              name: session.astrologer?.name,
              profilePic: session.astrologer?.profilePic,
              experience: session.astrologer?.experience,
              rating: session.astrologer?.rating,
              skills: session.astrologer?.skills,
              languages: session.astrologer?.languages,
            },
          };
        });

        console.log("========== END CALL HISTORY =============", data);

        return {
          success: true,

          summary: {
            totalCoinsDeducted,
            totalCoinsEarned,
            totalCommission,
            totalRecords: totalCount,
          },

          data,

          totalCount,

          currentPage: page,

          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        console.error("getUserCallHistory error:", error);

        throw new Error(error.message || "Failed to fetch call history");
      }
    },

    getGifts: async (_, __, context) => {
      try {
        // ==============================
        // AUTH CHECK
        // ==============================
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        console.log("USER:", context.user);

        // ==============================
        // FETCH GIFTS
        // ==============================
        const gifts = await prisma.gift.findMany({
          where: {
            status: "active",
          },

          orderBy: {
            createdAt: "desc",
          },
        });

        return {
          data: gifts,
          totalCount: gifts.length,
        };
      } catch (error) {
        console.error("getGifts error:", error);

        throw new Error(error.message || "Failed to fetch gifts");
      }
    },

    getBanners: async (_, { language }) => {
      try {
        const whereCondition = {
          status: true,

          ...(language && {
            language,
          }),
        };

        const banners = await prisma.banner.findMany({
          where: whereCondition,

          orderBy: {
            sortorder: "asc",
          },
        });

        return {
          data: banners,
          totalCount: banners.length,
        };
      } catch (error) {
        console.error("getBanners error:", error);

        throw new Error(error.message || "Failed to fetch banners");
      }
    },
    getFaqs: async () => {
      try {
        const faqs = await prisma.faq.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

        return {
          data: faqs,
          totalCount: faqs.length,
        };
      } catch (error) {
        console.error("getFaqs error:", error);

        throw new Error(error.message || "Failed to fetch FAQs");
      }
    },

    getTestimonials: async () => {
      try {
        const testimonials = await prisma.testimonial.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

        return {
          data: testimonials,
          totalCount: testimonials.length,
        };
      } catch (error) {
        console.error("getTestimonials error:", error);

        throw new Error(error.message || "Failed to fetch testimonials");
      }
    },

    getRemedies: async () => {
      try {
        const remedies = await prisma.remedy.findMany({
          where: {
            isActive: true,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

        return {
          data: remedies.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            isActive: item.isActive,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          })),

          totalCount: remedies.length,
        };
      } catch (error) {
        console.error("getRemedies error:", error);

        throw new Error("Failed to fetch remedies");
      }
    },
    getAboutPage: async () => {
      try {
        const aboutPage = await prisma.aboutPage.findFirst({
          where: {
            status: "PUBLISHED",
          },
        });

        if (!aboutPage) {
          throw new Error("About page not found");
        }

        return {
          id: aboutPage.id,
          pageType: aboutPage.pageType,
          heroTitle: aboutPage.heroTitle,
          heroDescription: aboutPage.heroDescription,

          mentors: aboutPage.mentors || [],

          founders: aboutPage.founders || [],

          metaTitle: aboutPage.metaTitle,
          metaDescription: aboutPage.metaDescription,
          keywords: aboutPage.keywords || [],

          status: aboutPage.status,

          createdAt: aboutPage.createdAt.toISOString(),
          updatedAt: aboutPage.updatedAt.toISOString(),
        };
      } catch (error) {
        console.error("getAboutPage error:", error);

        throw new Error("Failed to fetch about page");
      }
    },

    getAppVersion: async (_, { platform }) => {
      try {
        const appVersion = await prisma.appVersion.findFirst({
          where: {
            platform,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

        if (!appVersion) {
          throw new Error("App version not found");
        }

        return {
          id: appVersion.id,

          platform: appVersion.platform,

          latestVersion: appVersion.latestVersion,

          minimumVersion: appVersion.minimumVersion,

          forceUpdate: appVersion.forceUpdate,

          maintenanceMode: appVersion.maintenanceMode,

          maintenanceMessage: appVersion.maintenanceMessage,

          playStoreUrl: appVersion.playStoreUrl,

          appStoreUrl: appVersion.appStoreUrl,

          releaseNotes: appVersion.releaseNotes,

          createdAt: appVersion.createdAt.toISOString(),

          updatedAt: appVersion.updatedAt.toISOString(),
        };
      } catch (error) {
        console.error("getAppVersion error:", error);

        throw new Error(error.message || "Failed to fetch app version");
      }
    },
    getChatMessagesBySessionId: async (_, { sessionId }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        if (!sessionId) {
          throw new Error("Session ID is required");
        }

        const messages = await prisma.message.findMany({
          where: {
            sessionId,
          },

          orderBy: {
            createdAt: "asc",
          },
        });

        return messages.map((msg) => ({
          id: msg.id,
          msgId: msg.msgId,
          roomId: msg.roomId,

          senderId: msg.senderId,
          receiverId: msg.receiverId,

          message: msg.message,
          image: msg.image,

          sender: msg.sender,

          replyTo: msg.replyTo,

          createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
        }));
      } catch (error) {
        console.error("getChatMessagesBySessionId error:", error);

        throw new Error(error.message || "Failed to fetch session messages");
      }
    },
    getUserSessions: async (_, { filter }, context) => {
      try {
        if (!context.user) throw new Error("Unauthorized");

        const userId = context.user.id;

        const { status, fromDate, toDate, page = 1, limit = 10 } = filter || {};

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
    getChatMessages: async (_, { roomId, limit = 50, offset = 0 }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        if (!roomId) {
          throw new Error("roomId is required");
        }

        const redisKey = `chat_messages:${roomId}`;

        //  Pagination (important for performance)
        // Example: last 50 messages
        const start = -(offset + limit);
        const end = offset === 0 ? -1 : -(offset + 1);

        const rawMessages = await redis.lrange(redisKey, start, end);

        if (!rawMessages || rawMessages.length === 0) {
          return [];
        }

        const parsedMessages = [];

        for (const msg of rawMessages) {
          try {
            const parsed = JSON.parse(msg);

            parsedMessages.push({
              msg_id: parsed.msg_id || "",
              sender_id: parsed.sender_id || "",
              room_id: parsed.room_id || "",
              received_id: parsed.received_id || "",
              message: parsed.message || "",
              image: parsed.image || null,
              sender: parsed.sender || "",
              replyTo: parsed.replyTo || null,

              //  FIX TIME FORMAT ISSUE
              time: isNaN(new Date(parsed.time).getTime())
                ? new Date().toISOString()
                : new Date(parsed.time).toISOString(),
            });
          } catch (err) {
            console.error("Invalid message JSON:", msg);
          }
        }

        //  Ensure correct order (old → new)
        parsedMessages.sort((a, b) => new Date(a.time) - new Date(b.time));

        return parsedMessages;
      } catch (error) {
        console.error("getChatMessages error:", error);
        throw new Error(error.message || "Failed to fetch chat messages");
      }
    },

    recentIntakes: async (_, __, context) => {
      try {
        const userId = context.user.id;

        if (!userId) {
          throw new Error("Unauthorized");
        }

        const recentIntakes = await prisma.intake.findMany({
          where: {
            userId: userId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
          include: {
            astrologer: true, // optional if you want astrologer details
          },
        });

        return {
          success: true,
          message: "Recent intake fetched successfully",
          data: recentIntakes,
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },
    getFreeServices: async () => {
      try {
        const services = await prisma.freeService.findMany({
          where: {
            isActive: true,
          },
          orderBy: [
            {
              order: "asc",
            },
            {
              createdAt: "desc",
            },
          ],
        });

        return {
          data: services.map((item) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            href: item.href,
            icon: item.icon,
            isActive: item.isActive,
            order: item.order,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          })),
          totalCount: services.length,
        };
      } catch (error) {
        console.error("getFreeServices error:", error);

        throw new Error(error.message || "Failed to fetch free services");
      }
    },

    getFreeServiceById: async (_, { id }) => {
      try {
        const service = await prisma.freeService.findUnique({
          where: {
            id,
          },
        });

        if (!service) {
          throw new Error("Free service not found");
        }

        return {
          id: service.id,
          title: service.title,
          slug: service.slug,
          href: service.href,
          icon: service.icon,
          isActive: service.isActive,
          order: service.order,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
        };
      } catch (error) {
        console.error("getFreeServiceById error:", error);

        throw new Error(error.message || "Failed to fetch free service");
      }
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
        if (!countryCode || !mobile)
          throw new Error("Country code and mobile required");
        if (!otp) throw new Error("OTP required");

        const { accessToken, refreshToken, user, isNewUser, hasName } =
          await verifyOTPService(countryCode, mobile, otp);

        if (res?.setHeader) {
          res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            domain: ".dhwaniastro.com",
            maxAge: 1 * 24 * 60 * 60 * 1000, //for testing 1 day, can be changed to 15 * 60 * 1000 for 15 mins in production
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

        const { accessToken, refreshToken, user } =
          await refreshTokenService(token);

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
      await logEvent({
        userId: context.user.id,
        action: "UPDATE_PROFILE",
        details: input,
      });
      return updatedUser;
    },

    // intake for chat

    createIntake: async (_, { input }, context) => {
      const userId = context.user.id;

      // Generate Room ID
      const roomId = uuidv4();

      // Get User Wallet
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
      });

      if (!user || !user.wallet) {
        throw new Error("Wallet not found");
      }

      const walletBalance = user.wallet.balanceCoins || 0;

      // Get Astrologer with Pricing
      const astrologer = await prisma.astrologer.findUnique({
        where: { id: input.astrologerId },
        include: {
          pricing: {
            where: {
              type:
                input.requestType.toUpperCase() === "CALL" ? "CALL" : "CHAT",
              isActive: true,
            },
          },
        },
      });

      if (!astrologer) {
        throw new Error("Astrologer not found");
      }

      // Get pricing according to request type
      const pricing = astrologer.pricing?.[0];

      if (!pricing) {
        throw new Error(
          `${input.requestType} pricing not configured for astrologer`,
        );
      }

      // Use offer price if available otherwise normal price
      // const pricePerMin =
      //   pricing.offerPrice && pricing.offerPrice > 0
      //     ? pricing.offerPrice
      //     : pricing.price;

      // Check active global offer
       console.log("Checking active offers for astrologer:", input.astrologerId);
      const activeOffer = await prisma.astrologerOffer.findFirst({
        where: {
          astrologerId: input.astrologerId,
          isActive: true,
        },
        include: {
          offer: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });
     console.log("Active Offer:", activeOffer);
      let pricePerMin = pricing.price;

      // Highest priority → astrologer active offer
      if (
        activeOffer?.offer &&
        activeOffer.offer.isActive &&
        Number(activeOffer.offer.price) > 0
      ) {
        pricePerMin = Number(activeOffer.offer.price);
      }
      // Second priority → pricing offer price
      else if (Number(pricing.offerPrice) > 0) {
        pricePerMin = Number(pricing.offerPrice);
      }

      if (pricePerMin <= 0) {
        throw new Error("Invalid astrologer pricing");
      }
    console.log("Price per minute:", pricePerMin);
      // Calculate Chat/Call Time
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
          chatId: roomId,
        },
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
        astro_id: input.astrologerId,
        is_promotional: false,
        room_id: roomId,
        maximum_time: chatTime,
        user_image: user.profilePic || "",
        phoneNumber: `${input.countryCode}${input.mobile}`,
        createdAt: Date.now(),
      };

      if (
        input.requestType.toUpperCase() === "CALL" ||
        input.requestType.toUpperCase() === "CHAT"
      ) {
        const queueLength = await redis.llen(`queue:${input.astrologerId}`);

        if (queueLength > 4) {
          return {
            roomId,
            chatTime,
            intakeId: intake.id,
            message: "Sorry, queue is too long. Please try another astrologer.",
            pricePerMin,
            pricingType: pricing.type,
          };
        }

        const userQueueKey = `user_in_queue:${input.astrologerId}`;

        // Check duplicate user
        const alreadyExists = await redis.sismember(userQueueKey, userId);

        if (alreadyExists) {
          return {
            roomId,
            chatTime,
            intakeId: intake.id,
            message:
              "duplicate request. User is already in queue for this astrologer",
            pricePerMin,
            pricingType: pricing.type,
          };
        }

        const exists = await redis.exists(`request_data:${roomId}`);

        if (exists) return;

        await redis.set(
          `request_data:${roomId}`,
          JSON.stringify(queueData),
          "EX",
          7200,
        );

        await redis.rpush(
          `queue:${input.astrologerId}`,
          JSON.stringify({
            user_id: userId,
            roomId: roomId,
            maximum_time: chatTime,
            type: input.requestType.toUpperCase() === "CHAT" ? "chat" : "call",
          }),
        );

        await redis.sadd(userQueueKey, userId);

        // Return Response
        return {
          roomId,
          chatTime,
          intakeId: intake.id,
          message: "request send successfully",
          pricePerMin,
          pricingType: pricing.type,
        };
      }
    },

    createReview: async (_, { input }, context) => {
      try {
        console.log("createReview input:", input);

        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const userId = context.user.id;

        const { astro_id, star, comment } = input;

        // Validate rating
        if (star < 1 || star > 5) {
          throw new Error("Rating must be between 1 and 5");
        }

        // Find latest completed session
        const session = await prisma.session.findFirst({
          where: {
            userId,
            astrologerId: astro_id,
            status: "COMPLETED",
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (!session) {
          throw new Error("No completed session found with this astrologer");
        }

        // Prevent duplicate review for same session
        const existingReview = await prisma.review.findFirst({
          where: {
            userId,
            astrologerId: astro_id,
            sessionId: session.id,
          },
        });

        if (existingReview) {
          throw new Error("Review already submitted");
        }

        // Fetch user + astrologer names
        const [user, astrologer] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
          }),

          prisma.astrologer.findUnique({
            where: { id: astro_id },
            select: { name: true },
          }),
        ]);

        // Create review
        const review = await prisma.review.create({
          data: {
            userId,
            astrologerId: astro_id,
            sessionId: session.id,

            rating: star,
            comment: comment || null,

            userName: user?.name || null,
            astroName: astrologer?.name || null,

            isFlagged: false,
          },
        });

        // Calculate average rating
        const avgRating = await prisma.review.aggregate({
          where: {
            astrologerId: astro_id,
          },
          _avg: {
            rating: true,
          },
        });

        // Update astrologer rating
        await prisma.astrologer.update({
          where: {
            id: astro_id,
          },
          data: {
            rating: avgRating._avg.rating || 0,
          },
        });

        return {
          success: true,
          message: "Review submitted successfully",
          review,
        };
      } catch (error) {
        console.error("createReview error:", error);

        throw new Error(error.message || "Failed to submit review");
      }
    },
    uploadImage: async (_, { file }, context) => {
      console.log("uploadImage called with file:", file);
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }
        console.log("Received file:", file);
        const { createReadStream, filename, mimetype } = await file;

        // Validate image
        if (!mimetype.startsWith("image/")) {
          throw new Error("Only image files are allowed");
        }

        // Generate unique filename
        const ext = filename.split(".").pop();
        const newFileName = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}.${ext}`;

        const uploadPath = path.join(__dirname, "..", "uploads", newFileName);
        console.log("Saving file toAAAAAAAAAAAAAAA:", uploadPath);

        // Save file
        await new Promise((resolve, reject) => {
          const stream = createReadStream();
          const out = fs.createWriteStream(uploadPath);

          stream.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
        });

        // Return URL (adjust domain)
        const fileUrl = `https://dhwaniastro.com/v2/uploads/${newFileName}`;

        return {
          url: fileUrl,
          filename: newFileName,
        };
      } catch (error) {
        console.error("uploadImage error:", error);
        throw new Error(error.message || "Upload failed");
      }
    },

    createOrder: async (_, { input }, context) => {
      try {
        // ======================
        // AUTH CHECK
        // ======================
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const userId = context.user.id;

        const { rechargePackId } = input;

        // ======================
        // VALIDATE PACK
        // ======================
        const pack = await prisma.rechargePack.findUnique({
          where: { id: rechargePackId },
        });

        if (!pack) {
          throw new Error("Recharge pack not found");
        }

        // ======================
        // CREATE ORDER ID
        // ======================
        const receiptId = uuidv4();

        // ======================
        // CREATE RAZORPAY ORDER
        // ======================
        const order = await razorpay.orders.create({
          amount: Math.round(pack.price * 100), // paise
          currency: "INR",
          receipt: receiptId,
          notes: {
            userId,
            rechargePackId: pack.id,
            coins: pack.coins,
          },
        });

        // ======================
        // OPTIONAL: SAVE ORDER IN DB
        // ======================
        await prisma.paymentOrder.create({
          data: {
            userId,
            rechargePackId: pack.id,
            razorpayOrderId: order.id,
            amount: pack.price,
            coins: pack.coins,
            status: "CREATED",
          },
        });

        return {
          success: true,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        };
      } catch (error) {
        console.error("createRazorpayOrder error:", error);
        throw new Error(error.message || "Failed to create order");
      }
    },
    // new astrologer
    // new astrologer
    createAstrologerApplication: async (_, { input }) => {
      try {
        console.log("createAstrologerApplication input:", input);

        if (!input.phoneNumber || !input.name) {
          throw new Error("Required fields missing");
        }

        console.log("PRISMA MODEL:", prisma.astrologerApplication);

        const newApp = await prisma.astrologerApplication.create({
          data: {
            name: input.name,
            phoneNumber: input.phoneNumber,
            email: input.email,
            dob: input.dob ? new Date(input.dob) : null,
            gender: input.gender,
            languages: input.languages || [],
            problems: input.problems || [],
            skills: input.skills || [],
            experience: Number(input.experience) || 0,
            about: input.about || "",
            address: input.address || "",
            pincode: input.pincode || "",
          },
        });

        console.log("createAstrologerApplication result:", newApp);

        return newApp;
      } catch (error) {
        console.error("FULL ERROR:", error);
        throw error;
      }
    },

    logout: async (_, __, { user, res }) => {
      try {
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

        // Log logout
        await logEvent({ userId: user.id, action: "LOGOUT" });

        return true;
      } catch (error) {
        throw new Error(error.message || "Failed to logout");
      }
    },
  },
};
