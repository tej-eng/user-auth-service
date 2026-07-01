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
const { generateRtcToken } = require("../utils/agoraToken");
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
      console.log("Fetching wallet for user_id:", context.user.id);
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
    //---this api call without authentication as it is used in public search page
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

        const astrologerIds = astrologers.map((a) => a.id);

        const activeOffers = await prisma.astrologerOffer.findMany({
          where: {
            astrologerId: {
              in: astrologerIds,
            },
            isActive: true,
          },
          include: {
            offer: true,
          },
        });

        const offerMap = {};

        activeOffers.forEach((item) => {
          offerMap[item.astrologerId] = item.offer;
        });

        const data = astrologers.map((astro) => {
          const specialOffer = offerMap[astro.id];

          return {
            id: astro.id,
            profilePic: astro.profilePic,
            name: astro.name,
            experience: astro.experience,
            rating: astro.rating,
            skills: astro.skills,
            languages: astro.languages,
            isBusy: astro.isBusy,
            isOnline: astro.isOnline,
            isChatActive: astro.isChatActive,
            isCallActive: astro.isCallActive,
            isLiveActive: astro.isLiveActive,

            activeOffer: specialOffer
              ? {
                  id: specialOffer.id,
                  offerName: specialOffer.offerName,
                  price: specialOffer.price,
                  description: specialOffer.description,
                }
              : null,

            pricing: astro.pricing.map((p) => ({
              type: p.type,

              price: specialOffer ? specialOffer.price : p.price,

              originalPrice: p.price,

              commissionPercent: p.commissionPercent,

              isActive: p.isActive,
            })),
          };
        });

        return {
          data,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        console.error(error);
        throw new Error(error.message);
      }
    },

    //-----this api call for with auth--
    getAstrologerListForUser: async (_, { searchInput }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const userId = context.user.id;

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

        const [astrologers, totalCount, pricingConfig, usage] =
          await Promise.all([
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

            prisma.astrologer.count({
              where,
            }),

            prisma.pricingConfig.findFirst(),

            prisma.userOfferUsage.findUnique({
              where: {
                userId,
              },
            }),
          ]);

        const astrologerIds = astrologers.map((a) => a.id);

        const activeOffers = await prisma.astrologerOffer.findMany({
          where: {
            astrologerId: {
              in: astrologerIds,
            },
            isActive: true,
          },
          include: {
            offer: true,
          },
        });

        const offerMap = {};

        activeOffers.forEach((item) => {
          offerMap[item.astrologerId] = item.offer;
        });

        const data = astrologers.map((astro) => {
          const specialOffer = offerMap[astro.id];

          return {
            id: astro.id,
            profilePic: astro.profilePic,
            name: astro.name,
            experience: astro.experience,
            rating: astro.rating,
            skills: astro.skills,
            languages: astro.languages,
            isBusy: astro.isBusy,
            isOnline: astro.isOnline,
            isChatActive: astro.isChatActive,
            isCallActive: astro.isCallActive,
            isLiveActive: astro.isLiveActive,

            activeOffer: specialOffer
              ? {
                  id: specialOffer.id,
                  offerName: specialOffer.offerName,
                  price: specialOffer.price,
                  description: specialOffer.description,
                }
              : null,

            pricing: astro.pricing.map((p) => {
              let finalPrice = p.price;
              let appliedOffer = null;

              // 1. Special Offer
              if (specialOffer) {
                finalPrice = specialOffer.price;

                appliedOffer = specialOffer.offerName;
              }

              // 2. First Offer
              else if (
                pricingConfig?.isFirstOfferEnabled &&
                !usage?.usedFirst
              ) {
                finalPrice =
                  p.type === "CHAT"
                    ? pricingConfig.firstChatPrice
                    : pricingConfig.firstCallPrice;

                appliedOffer = "FIRST_TIME_OFFER";
              }

              // 3. Second Offer
              else if (
                pricingConfig?.isSecondOfferEnabled &&
                usage?.usedFirst &&
                !usage?.usedSecond
              ) {
                finalPrice =
                  p.type === "CHAT"
                    ? pricingConfig.secondChatPrice
                    : pricingConfig.secondCallPrice;

                appliedOffer = "SECOND_TIME_OFFER";
              }

              // 4. Global Offer
              else if (pricingConfig?.isGlobalOfferEnabled) {
                finalPrice =
                  p.type === "CHAT"
                    ? pricingConfig.globalChatPrice
                    : pricingConfig.globalCallPrice;

                appliedOffer = "GLOBAL_OFFER";
              }

              return {
                type: p.type,

                price: finalPrice,

                originalPrice: p.price,

                appliedOffer,

                commissionPercent: p.commissionPercent,

                isActive: p.isActive,
              };
            }),
          };
        });

        return {
          data,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        console.error(error);

        throw new Error(error.message);
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

        /* =========================================
       TOTAL COUNT
    ========================================= */
        const totalCount = await prisma.session.count({
          where: sessionWhere,
        });

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
            source: session.source || null,

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

        /* =========================================
       TOTAL COUNT
    ========================================= */
        const totalCount = await prisma.session.count({
          where: sessionWhere,
        });

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
    getPrivacyPage: async () => {
      return await prisma.privacyPage.findFirst({
        where: {
          pageType: "privacy-policy",
        },
      });
    },
    getRefundPolicyPage: async () => {
      return await prisma.refundPolicyPage.findFirst({
        where: {
          pageType: "refund-policy",
        },
      });
    },
    getDisclaimerPage: async () => {
      return await prisma.disclaimerPage.findFirst({
        where: {
          pageType: "disclaimer",
        },
      });
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
    getSessionRemedy: async (_, { sessionId }, context) => {
      if (!context.user) {
        throw new Error("Unauthorized");
      }

      const remedy = await prisma.sessionRemedy.findFirst({
        where: {
          sessionId,
        },
        include: {
          session: {
            include: {
              astrologer: true,
            },
          },
        },
      });

      if (!remedy) return null;

      return {
        id: remedy.id,
        remedyText: remedy.remedyText,
        createdAt: remedy.createdAt.toISOString(),
        astrologerName: remedy.session.astrologer.name,
      };
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

    getGiftHistory: async (_, args, context) => {
      try {
        const giftHistory = await prisma.giftHistory.findMany({
          orderBy: {
            createdAt: "desc",
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
              },
            },
          },
        });

        return giftHistory.map((item) => ({
          id: item.id,
          userId: item.userId,
          astrologerId: item.astrologerId,
          giftId: item.giftId,
          giftName: item.giftName,
          giftPrice: item.giftPrice,
          createdAt: item.createdAt.toISOString(),

          user: item.user,
          astrologer: item.astrologer,
        }));
      } catch (error) {
        console.error("getGiftHistory error:", error);
        throw new Error(error.message);
      }
    },
    isFollowing: async (_, { astrologerId }, context) => {
      try {
        const { user } = context;

        if (!user) {
          return {
            isFollowing: false,
          };
        }

        const follow = await prisma.astrologerFollow.findUnique({
          where: {
            userId_astrologerId: {
              userId: user.id,
              astrologerId,
            },
          },
        });

        return {
          isFollowing: !!follow,
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },
    getAstrologerFollowersCount: async (_, { astrologerId }, context) => {
      try {
        // const { prisma } = context;

        const totalFollowers = await prisma.astrologerFollow.count({
          where: {
            astrologerId,
          },
        });

        return {
          totalFollowers,
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },
    getFollowedAstrologers: async (_, { page = 1, limit = 10 }, context) => {
      try {
        const { user } = context;

        if (!user) {
          throw new Error("Unauthorized");
        }

        const skip = (page - 1) * limit;

        const total = await prisma.astrologerFollow.count({
          where: {
            userId: user.id,
          },
        });

        const followedAstrologers = await prisma.astrologerFollow.findMany({
          where: {
            userId: user.id,
          },
          include: {
            astrologer: {
              include: {
                pricing: true,
                wallet: true,
                offers: {
                  include: {
                    offer: true,
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

        return {
          astrologers: followedAstrologers.map((follow) => ({
            ...follow.astrologer,

            isChatActive: follow.astrologer.isChatActive,
            isCallActive: follow.astrologer.isCallActive,
            isLiveActive: follow.astrologer.isLiveActive,
            isPromotional: follow.astrologer.isPromotional,
            isBusy: follow.astrologer.isBusy,
          })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },

    getCategories: async () => {
      try {
        const categories = await prisma.category.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

        return categories.map((category) => ({
          ...category,
          createdAt: category.createdAt.toISOString(),
        }));
      } catch (error) {
        console.error("getCategories error:", error);

        throw new Error(error.message || "Failed to fetch categories");
      }
    },

    getCategory: async (_, { slug }) => {
      try {
        const category = await prisma.category.findUnique({
          where: { slug },
          include: {
            services: {
              include: {
                astrologerMappings: {
                  select: {
                    price: true,
                  },
                },
              },
            },
          },
        });

        if (!category) {
          throw new Error("Category not found");
        }

        return {
          ...category,
          createdAt: category.createdAt.toISOString(),
          services: category.services.map((service) => ({
            ...service,
            price:
              service.astrologerMappings.length > 0
                ? Math.min(...service.astrologerMappings.map((m) => m.price))
                : null,
            createdAt: service.createdAt.toISOString(),
            updatedAt: service.updatedAt.toISOString(),
          })),
        };
      } catch (error) {
        console.error("getCategory error:", error);

        throw new Error(error.message || "Failed to fetch category");
      }
    },

    getServices: async () => {
      try {
        const services = await prisma.service.findMany({
          include: {
            category: true,

            astrologerMappings: {
              select: {
                price: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        return services.map((service) => ({
          ...service,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
          category: service.category
            ? {
                ...service.category,
                createdAt: service.category.createdAt.toISOString(),
              }
            : null,
        }));
      } catch (error) {
        console.error("getServices error:", error);

        throw new Error(error.message || "Failed to fetch services");
      }
    },

    getService: async (_, { slug }) => {
      try {
        const service = await prisma.service.findUnique({
          where: {
            slug,
          },

          include: {
            category: true,

            astrologerMappings: {
              include: {
                astrologer: {
                  include: {
                    pricing: {
                      where: {
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!service) {
          throw new Error("Service not found");
        }

        return {
          ...service,

          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),

          category: service.category
            ? {
                ...service.category,
                createdAt: service.category.createdAt.toISOString(),
              }
            : null,

          astrologerMappings: service.astrologerMappings.map((mapping) => ({
            ...mapping,

            astrologer: {
              ...mapping.astrologer,
            },
          })),
        };
      } catch (error) {
        console.error("getService error:", error);

        throw new Error(error.message || "Failed to fetch service");
      }
    },
    // getServiceBooking: async (_, { id }) => {
    //   return prisma.serviceBooking.findUnique({
    //     where: { id },
    //     include: {
    //       service: true,
    //     },
    //   });
    // },

    getMyServiceBookings: async (_, { page = 1, limit = 10 }, { user }) => {
      const skip = (page - 1) * limit;

      const [data, totalCount] = await Promise.all([
        prisma.serviceBooking.findMany({
          where: {
            userId: user.id,
          },
          include: {
            service: true,
            astrologer: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.serviceBooking.count({
          where: {
            userId: user.id,
          },
        }),
      ]);

      return {
        data,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

    blogs: async () => {
      const blogs = await prisma.blog.findMany({
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return blogs.map((blog) => ({
        ...blog,
        categories: blog.categories?.map((item) => item.category) || [],
      }));
    },
    blogBySlug: async (_, { slug }) => {
      const blog = await prisma.blog.findUnique({
        where: {
          slug,
        },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      });

      return {
        ...blog,
        categories: blog?.categories?.map((item) => item.category) || [],
      };
    },
    blogCategories: async () => {
      console.log("blogCategories called");

      const data = await prisma.blogCategory.findMany();

      console.log(data);

      return data;
    },
    getUpcomingLives: async (_, { page = 1, limit = 10 }) => {
      try {
        const skip = (page - 1) * limit;

        const where = {
          status: {
            in: ["LIVE", "SCHEDULED"],
          },
        };

        const [data, totalCount] = await Promise.all([
          prisma.liveStream.findMany({
            where,

            include: {
              astrologer: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  profilePic: true,
                  rating: true,
                },
              },
            },

            orderBy: {
              scheduledAt: "asc",
            },

            skip,
            take: limit,
          }),

          prisma.liveStream.count({
            where,
          }),
        ]);

        return {
          data,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        console.error("getUpcomingLives Error:", error);

        throw new Error(error.message || "Failed to fetch upcoming lives");
      }
    },

    joinLive: async (_, { channelName }, { user }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      const stream = await prisma.liveStream.findFirst({
        where: {
          channelName,
          status: "LIVE",
        },
      });

      if (!stream) {
        throw new Error("Live stream not found");
      }

      const uid = Math.floor(Math.random() * 100000);

      const token = generateRtcToken({
        channelName,
        uid,
        role: "subscriber",
      });

      return {
        token,
        uid,
        appId: process.env.AGORA_APP_ID || "3a1816ebf7bf47b094c7540e2cf2aac0",
        channelName,
      };
    },
    getCoupons: async () => {
      try {
        return await prisma.coupon.findMany({
          where: {
            status: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      } catch (error) {
        throw error;
      }
    },
    getServiceBooking: async (_, { bookingId }) => {
      return prisma.serviceBooking.findUnique({
        where: {
          id: bookingId,
        },
        include: {
          service: true,
          astrologer: true,
        },
      });
    },
  },
  //----------------start code for mutation ----------------------------
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

    authWithOtp: async (_, { countryCode, mobile, otp, source }, { res }) => {
      try {
        if (!countryCode || !mobile)
          throw new Error("Country code and mobile required");
        if (!otp) throw new Error("OTP required");

        const { accessToken, refreshToken, user, isNewUser, hasName } =
          await verifyOTPService(countryCode, mobile, otp, source);

        if (res?.setHeader) {
          res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            domain: ".dhwaniastro.com",
            maxAge: 1 * 24 * 60 * 60 * 1000,
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
          details: {
            countryCode,
            mobile,
            source,
          },
        });

        return {
          user,
          accessToken,
          refreshToken,
          isNewUser,
          hasName,
        };
      } catch (error) {
        await logEvent({
          action: "FAILED_LOGIN_OTP",
          details: {
            countryCode,
            mobile,
            source,
            error: error.message,
          },
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
      console.log("source---------------", input);
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

      // Get pricing config
      const pricingConfig = await prisma.pricingConfig.findFirst();

      // Get or create user offer usage
      let userOfferUsage = await prisma.userOfferUsage.findUnique({
        where: {
          userId,
        },
      });

      if (!userOfferUsage) {
        userOfferUsage = await prisma.userOfferUsage.create({
          data: {
            userId,
          },
        });
      }

      if (!astrologer) {
        throw new Error("Astrologer not found");
      }

      if (
        input.requestType.toUpperCase() === "CALL" &&
        !astrologer.isCallActive
      ) {
        throw new Error("Call service is disabled by astrologer");
        return;
      }

      if (
        input.requestType.toUpperCase() === "CHAT" &&
        !astrologer.isChatActive
      ) {
        throw new Error("Chat service is disabled by astrologer");
        return;
      }

      if (!astrologer.isOnline) {
        throw new Error("Astrologer is offline");
        return;
      }

      // Get pricing according to request type
      const pricing = astrologer.pricing?.[0];

      if (!pricing) {
        throw new Error(
          `${input.requestType} pricing not configured for astrologer`,
        );
      }
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

      // DEFAULT PRICE

      let pricePerMin = Number(pricing.price);
      let appliedOffer = "NORMAL";

      const requestType =
        input.requestType.toUpperCase() === "CALL" ? "CALL" : "CHAT";

      // ----------------------------------------------------
      // FIRST TIME OFFER
      // ----------------------------------------------------

      if (
        pricingConfig?.isFirstOfferEnabled &&
        !userOfferUsage.firstOfferUsedAt
      ) {
        pricePerMin =
          requestType === "CALL"
            ? Number(pricingConfig.firstCallPrice)
            : Number(pricingConfig.firstChatPrice);

        appliedOffer = "FIRST_TIME_OFFER";
      }

      // ----------------------------------------------------
      // SECOND TIME OFFER
      // ----------------------------------------------------
      else if (
        pricingConfig?.isSecondOfferEnabled &&
        !userOfferUsage.secondOfferUsedAt
      ) {
        pricePerMin =
          requestType === "CALL"
            ? Number(pricingConfig.secondCallPrice)
            : Number(pricingConfig.secondChatPrice);

        appliedOffer = "SECOND_TIME_OFFER";
      }

      // ----------------------------------------------------
      // GLOBAL OFFER
      // ----------------------------------------------------
      else if (pricingConfig?.isGlobalOfferEnabled) {
        pricePerMin =
          requestType === "CALL"
            ? Number(pricingConfig.globalCallPrice)
            : Number(pricingConfig.globalChatPrice);

        appliedOffer = "GLOBAL_OFFER";
      }

      // ----------------------------------------------------
      // BIRTHDAY / DIWALI / SPECIAL OFFER
      // ----------------------------------------------------
      else if (
        activeOffer?.offer &&
        activeOffer.offer.isActive &&
        Number(activeOffer.offer.price) >= 0
      ) {
        pricePerMin = Number(activeOffer.offer.price);

        appliedOffer =
          activeOffer.offer.offerName || "ASTROLOGER_SPECIAL_OFFER";
      }

      // ----------------------------------------------------
      // ASTROLOGER OFFER PRICE
      // ----------------------------------------------------
      else if (pricing.offerPrice && Number(pricing.offerPrice) >= 0) {
        pricePerMin = Number(pricing.offerPrice);

        appliedOffer = "ASTROLOGER_OFFER_PRICE";
      }

      // ----------------------------------------------------
      // NORMAL PRICE
      // ----------------------------------------------------
      else {
        pricePerMin = Number(pricing.price);

        appliedOffer = "NORMAL";
      }

      // ----------------------------------------------------
      // VALIDATION
      // ----------------------------------------------------

      // if (!pricePerMin || Number(pricePerMin) <= 0) {
      //   throw new Error("Invalid astrologer pricing");
      // }

      // console.log("Final Price:", pricePerMin);
      // console.log("Applied Offer:", appliedOffer);

      // if (pricePerMin <= 0) {
      //   throw new Error("Invalid astrologer pricing");
      // }
      console.log("Price per minute:", pricePerMin);
      // Calculate Chat/Call Time
      let chatTime = 0;
      if (pricePerMin == 0) {
        chatTime = 5;
      } else {
        chatTime = Math.floor(walletBalance / pricePerMin);
      }

      // if (chatTime <= 0) {
      //   throw new Error("Insufficient balance");
      // }

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
          appliedOffer,
          pricePerMin,
          latitude: input.latitude,
          longitude: input.longitude,
          source: input.source,
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
        source: input.source,
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
            source: input.source,
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
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }
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

    // In your resolvers file

    uploadCallRecording: async (
      _,
      { recording, roomId, astroId, astroName, userId, duration, callType },
      context,
    ) => {
      try {
        // Check authentication
        if (!context.user) {
          throw new Error("Unauthorized - Please login to upload recordings");
        }

        console.log("🎙 Starting call recording upload...");
        console.log("Uploaded by:", context.user.email || context.user.id);
        console.log("Room ID:", roomId);

        const { createReadStream, filename, mimetype } = await recording;

        // Validate file type - allow audio files only
        const allowedMimeTypes = [
          "audio/webm",
          "audio/webm;codecs=opus",
          "audio/ogg",
          "audio/mpeg",
          "audio/mp4",
          "audio/wav",
        ];

        if (
          !allowedMimeTypes.some(
            (type) => mimetype.includes(type) || mimetype.startsWith("audio/"),
          )
        ) {
          throw new Error("Only audio files are allowed for call recordings");
        }

        // Generate unique filename
        const ext = filename.split(".").pop() || "webm";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const newFileName = `call-${roomId}-${timestamp}.${ext}`;

        // Create upload directory with restricted permissions
        const uploadDir = path.join(
          __dirname,
          "..",
          "uploads",
          "call-recordings",
        );
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
          console.log("📁 Created upload directory:", uploadDir);
        }

        const uploadPath = path.join(uploadDir, newFileName);
        console.log("💾 Saving recording to:", uploadPath);

        // Save file asynchronously
        await new Promise((resolve, reject) => {
          const stream = createReadStream();
          const out = fs.createWriteStream(uploadPath, { mode: 0o640 });

          stream.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
          stream.on("error", reject);
        });

        console.log("✅ Recording saved successfully:", newFileName);

        // Get file size
        const stats = fs.statSync(uploadPath);
        const fileSize = stats.size;

        // Generate secure file URL
        const fileToken = Buffer.from(`${roomId}:${Date.now()}`).toString(
          "base64",
        );
        const fileUrl = `https://dhwaniastro.com/v2/uploads/call-recordings/${newFileName}?token=${fileToken}`;

        // Find session by roomId (optional)
        let sessionId = null;
        if (roomId) {
          const session = await prisma.session.findFirst({
            where: { roomId: roomId },
            select: { id: true },
          });
          if (session) {
            sessionId = session.id;
            console.log("✅ Found session:", sessionId);
          }
        }

        // Save to database using Prisma - MATCHES YOUR SCHEMA
        console.log("Astrologer ID received:", astroId);
        console.log("User ID received:", userId);
        const recordingData = await prisma.callRecording.create({
          data: {
            roomId: roomId,
            sessionId: sessionId, // This is a field in your model
            userId: userId || context.user.id,
            astrologerId: astroId,
            astrologerName: astroName || "",
            fileName: newFileName,
            fileUrl: fileUrl,
            filePath: uploadPath,
            fileSize: fileSize,
            duration: parseInt(duration) || 0,
            callType: callType || "audio",
            timestamp: new Date().toISOString(),
            status: "active",
            isAdminOnly: true,
            uploadedBy: context.user.id || context.user.email || "unknown",
            uploadedAt: new Date(),
            metadata: {
              userAgent: context.user?.userAgent || null,
              ipAddress: context.user?.ipAddress || null,
              originalFilename: filename,
              mimeType: mimetype,
            },
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
                displayName: true,
              },
            },
            session: {
              select: {
                id: true,
                status: true,
                type: true,
              },
            },
          },
        });

        console.log("📊 Recording saved to database:", {
          id: recordingData.id,
          roomId: recordingData.roomId,
          sessionId: recordingData.sessionId,
          duration: recordingData.duration,
          fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        });

        return {
          success: true,
          message: "Call recording uploaded successfully (Admin only access)",
          recording: {
            id: recordingData.id,
            roomId: recordingData.roomId,
            astroId: recordingData.astrologerId,
            astroName: recordingData.astrologerName,
            userId: recordingData.userId,
            duration: recordingData.duration,
            callType: recordingData.callType,
            recordingUrl: recordingData.fileUrl,
            createdAt: recordingData.createdAt.toISOString(),
            updatedAt: recordingData.updatedAt.toISOString(),
          },
          fileUrl: fileUrl,
        };
      } catch (error) {
        console.error("❌ uploadCallRecording error:", error);
        return {
          success: false,
          message: error.message || "Failed to upload call recording",
          recording: null,
          fileUrl: null,
        };
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
        const { rechargePackId, coupan_code } = input;

        // ======================
        // VALIDATE RECHARGE PACK
        // ======================
        const pack = await prisma.rechargePack.findUnique({
          where: {
            id: rechargePackId,
          },
        });

        if (!pack) {
          throw new Error("Recharge pack not found");
        }

        // ======================
        // DEFAULT VALUES
        // ======================
        let coupon = null;
        let discount = 0;
        let cashback = 0;
        let finalAmount = pack.price;

        // ======================
        // APPLY COUPON (OPTIONAL)
        // ======================
        if (coupan_code && coupan_code.trim() !== "") {
          coupon = await prisma.coupon.findUnique({
            where: {
              code: coupan_code.trim(),
            },
            include: {
              rechargePacks: true,
            },
          });

          if (!coupon) {
            throw new Error("Invalid coupon code");
          }

          const now = new Date();

          // Coupon Active
          if (!coupon.status) {
            throw new Error("Coupon is inactive");
          }

          // Coupon Start Date
          if (coupon.startDate > now) {
            throw new Error("Coupon is not active yet");
          }

          // Coupon Expiry
          if (coupon.endDate < now) {
            throw new Error("Coupon has expired");
          }

          // Redeem Limit
          if (coupon.redeemLimit && coupon.usedCount >= coupon.redeemLimit) {
            throw new Error("Coupon redemption limit exceeded");
          }

          // Minimum Order Amount
          if (coupon.minOrderAmount && pack.price < coupon.minOrderAmount) {
            throw new Error(
              `Minimum recharge amount should be ₹${coupon.minOrderAmount}`,
            );
          }

          // Applicable Recharge Pack
          if (
            coupon.rechargePacks.length > 0 &&
            !coupon.rechargePacks.some((p) => p.id === pack.id)
          ) {
            throw new Error("Coupon is not applicable for this recharge pack");
          }

          // ======================
          // CALCULATE DISCOUNT
          // ======================
          if (coupon.type === "DISCOUNT") {
            // Percentage discount
            discount = (pack.price * (coupon.percentage || 0)) / 100;

            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
              discount = coupon.maxDiscount;
            }

            discount = Math.min(discount, pack.price);

            finalAmount = pack.price - discount;

            // GST on discounted amount (if your business logic requires it)
            finalAmount += (finalAmount * 18) / 100;
          } else if (coupon.type === "CASHBACK") {
            // Customer pays full amount
            finalAmount = pack.price;

            // GST on full amount
            finalAmount += (finalAmount * 18) / 100;

            // Cashback amount to be credited later
            cashback = (pack.price * (coupon.percentage || 0)) / 100;

            if (coupon.maxDiscount && cashback > coupon.maxDiscount) {
              cashback = coupon.maxDiscount;
            }

            cashback = Math.min(cashback, pack.price);
          }
        } else {
          //-----NORMAL RECHARGE WITHOUT COUPAN
          finalAmount += (finalAmount * 18) / 100;
        }

        // ======================
        // CREATE RAZORPAY ORDER
        // ======================

        const notes = {
          userId,
          rechargePackId: pack.id,
          coins: pack.coins,
          couponCode: coupon?.code || "",
          type: coupon?.type || "NORMAL",
        };

        if (coupon?.type === "DISCOUNT") {
          notes.discount = discount.toString();
        }

        if (coupon?.type === "CASHBACK") {
          notes.cashback = cashback.toString();
        }
        const receiptId = uuidv4();
        const order = await razorpay.orders.create({
          amount: Math.round(finalAmount * 100), // paise
          currency: "INR",
          receipt: receiptId,
          notes,
        });

        // ======================
        // SAVE PAYMENT ORDER
        // ======================
        await prisma.paymentOrder.create({
          data: {
            userId,
            rechargePackId: pack.id,
            couponId: coupon?.id || null,
            razorpayOrderId: order.id,

            originalAmount: pack.price,
            discount: discount,
            amount: finalAmount,

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
        console.error("createOrder error:", error);
        throw new Error(error.message || "Failed to create order");
      }
    },

    createHealingOrder: async (_, { bookingId }, context) => {
      try {
        // ======================
        // AUTH CHECK
        // ======================
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const userId = context.user.id;

        // ======================
        // FIND BOOKING
        // ======================
        const booking = await prisma.serviceBooking.findUnique({
          where: {
            id: bookingId,
          },
        });

        if (!booking) {
          throw new Error("Booking not found");
        }

        if (booking.amount == null) {
          throw new Error("Booking amount not found");
        }

        const totalAmount = Number(booking.amount);

        // Full amount paid via Razorpay
        const walletAmount = 0;
        const payableAmount = totalAmount;

        // ======================
        // CREATE RAZORPAY ORDER
        // ======================
        const receiptId = uuidv4();

        const order = await razorpay.orders.create({
          amount: totalAmount * 100,
          currency: "INR",
          receipt: receiptId,
          notes: {
            bookingId: booking.id,
            serviceId: booking.serviceId,
            astrologerId: booking.astrologerId,
            userId,
          },
        });

        const razorpayOrderId = order.id;

        // ======================
        // SAVE ORDER IN DB
        // ======================
        await prisma.servicePaymentOrder.create({
          data: {
            userId,
            bookingId: booking.id,
            razorpayOrderId,

            totalAmount,
            walletAmount,
            payableAmount,

            status: "CREATED",
          },
        });

        return {
          success: true,
          orderId: razorpayOrderId,
          currency: "INR",
          bookingId: booking.id,

          totalAmount,
          walletAmount,
          payableAmount,
        };
      } catch (error) {
        console.error("createHealingOrder error:", error);

        throw new Error(error.message || "Failed to create healing order");
      }
    },

    // new astrologer
    // new astrologer
    createAstrologerApplication: async (_, { input }) => {
      try {
        if (!input.phoneNumber || !input.name) {
          throw new Error("Required fields missing");
        }

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
    sendGift: async (_, { input }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        const { astro_id, gift_id, giftname, giftprice, user_id } = input;

        // -----------------------------
        // Fetch wallets
        // -----------------------------
        const userWallet = await prisma.userWallet.findUnique({
          where: {
            userId: user_id,
          },
        });
        if (!userWallet) {
          throw new Error("User wallet not found");
        }

        if (Number(userWallet.balanceCoins) < Number(giftprice)) {
          throw new Error("Insufficient wallet balance");
        }

        const astrologerWallet = await prisma.astrologerWallet.findUnique({
          where: {
            astrologerId: astro_id,
          },
        });
        console.log("Astrologer Wallet:", astrologerWallet);

        // if (!astrologerWallet) {
        //   throw new Error("Astrologer wallet not found");
        // }

        // -----------------------------
        // Transaction
        // -----------------------------
        const result = await prisma.$transaction(async (tx) => {
          // Debit User Wallet
          const updatedUserWallet = await tx.userWallet.update({
            where: {
              id: userWallet.id,
            },
            data: {
              balanceCoins: {
                decrement: Number(giftprice),
              },
            },
          });

          // Credit Astrologer Wallet
          const updatedAstroWallet = await tx.astrologerWallet.update({
            where: {
              id: astrologerWallet.id,
            },
            data: {
              balanceCoins: {
                increment: Number(giftprice),
              },
            },
          });

          // Save Gift History
          await tx.giftHistory.create({
            data: {
              userId: user_id,
              astrologerId: astro_id,
              giftId: gift_id,
              giftName: giftname,
              giftPrice: Number(giftprice),
            },
          });

          // User Wallet Transaction
          await tx.walletTransaction.create({
            data: {
              userWalletId: userWallet.id,

              type: "DEBIT",

              coins: Number(giftprice),
              amount: Number(giftprice),

              description: `Gift Sent - ${giftname}`,
            },
          });

          // Astrologer Wallet Transaction
          await tx.walletTransaction.create({
            data: {
              astrologerWalletId: astrologerWallet.id,

              type: "CREDIT",

              coins: Number(giftprice),
              amount: Number(giftprice),

              description: `Gift Received - ${giftname}`,
            },
          });

          return {
            updatedUserWallet,
            updatedAstroWallet,
          };
        });

        return {
          success: true,
          message: "Gift sent successfully",

          userBalance: result.updatedUserWallet.balanceCoins,

          astrologerBalance: result.updatedAstroWallet.balanceCoins,
        };
      } catch (error) {
        console.error("sendGift error:", error);

        throw new Error(error.message);
      }
    },
    followAstrologer: async (_, { astrologerId }, context) => {
      console.log("followAstrologer called with astrologerId:", astrologerId);
      try {
        const { user } = context;

        if (!user) {
          throw new Error("Unauthorized");
        }

        const astrologer = await prisma.astrologer.findUnique({
          where: {
            id: astrologerId,
          },
        });
        console.log("Astrologer found:", astrologer);
        if (!astrologer) {
          throw new Error("Astrologer not found");
        }

        const existingFollow = await prisma.astrologerFollow.findUnique({
          where: {
            userId_astrologerId: {
              userId: user.id,
              astrologerId,
            },
          },
        });

        if (existingFollow) {
          throw new Error("Already following this astrologer");
        }

        await prisma.astrologerFollow.create({
          data: {
            userId: user.id,
            astrologerId,
          },
        });

        return {
          success: true,
          message: "Astrologer followed successfully",
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },
    unfollowAstrologer: async (_, { astrologerId }, context) => {
      try {
        const { user } = context;

        if (!user) {
          throw new Error("Unauthorized");
        }

        await prisma.astrologerFollow.delete({
          where: {
            userId_astrologerId: {
              userId: user.id,
              astrologerId,
            },
          },
        });

        return {
          success: true,
          message: "Astrologer unfollowed successfully",
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },

    createServiceBooking: async (_, { input }, { user }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      const service = await prisma.service.findUnique({
        where: {
          id: input.serviceId,
        },
      });

      if (!service) {
        throw new Error("Service not found");
      }

      return prisma.serviceBooking.create({
        data: {
          ...input,
          userId: user.id,
          amount: null,
        },
      });
    },

    updateBookingAstrologer: async (_, { bookingId, astrologerId }) => {
      // Check booking
      const booking = await prisma.serviceBooking.findUnique({
        where: {
          id: bookingId,
        },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      // Check astrologer
      const astrologer = await prisma.astrologer.findUnique({
        where: {
          id: astrologerId,
        },
      });

      if (!astrologer) {
        throw new Error("Astrologer not found");
      }

      // Find service-astrologer mapping
      const mapping = await prisma.serviceAstrologer.findFirst({
        where: {
          serviceId: booking.serviceId,
          astrologerId,
        },
      });

      if (!mapping) {
        throw new Error(
          "Selected astrologer is not available for this service",
        );
      }

      // Update booking
      return prisma.serviceBooking.update({
        where: {
          id: bookingId,
        },
        data: {
          astrologerId,
          amount: mapping.price,
        },
        include: {
          astrologer: true,
          service: true,
        },
      });
    },

    confirmWalletBooking: async (
      _,
      { bookingId, astrologerId, walletAmount },
      { user },
    ) => {
      const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.serviceBooking.findUnique({
          where: { id: bookingId },
        });

        if (!booking) {
          throw new Error("Booking not found");
        }

        const wallet = await tx.userWallet.findUnique({
          where: { userId: user.id },
        });

        if (!wallet || wallet.balanceCoins < walletAmount) {
          throw new Error("Insufficient wallet balance");
        }

        await tx.userWallet.update({
          where: { userId: user.id },
          data: {
            balanceCoins: {
              decrement: walletAmount,
            },
          },
        });

        const updatedBooking = await tx.serviceBooking.update({
          where: { id: bookingId },
          data: {
            astrologerId,
            bookingStatus: "COMPLETED", // or ASSIGNED as per your flow
            paymentStatus: "SUCCESS",
          },
          include: {
            astrologer: true,
            service: true,
          },
        });

        return updatedBooking;
      });

      return {
        success: true,
        message: "Booking confirmed successfully",
        booking: result,
      };
    },
    startLive: async (_, { title }, { user }) => {
      try {
        if (!user) {
          throw new Error("Unauthorized");
        }

        let stream = await prisma.liveStream.findFirst({
          where: {
            astrologerId: user.id,
            status: "SCHEDULED",
          },
          orderBy: {
            scheduledAt: "asc",
          },
        });

        if (stream) {
          stream = await prisma.liveStream.update({
            where: {
              id: stream.id,
            },
            data: {
              status: "LIVE",
            },
          });
        } else {
          stream = await prisma.liveStream.create({
            data: {
              astrologerId: user.id,
              title,
              channelName: `astro-${user.id}`,
              status: "LIVE",
            },
          });
        }

        const uid = Math.floor(Math.random() * 100000);

        const token = generateRtcToken({
          channelName: stream.channelName,
          uid,
          role: "publisher",
        });

        return {
          token,
          uid,
          appId: process.env.AGORA_APP_ID || "3a1816ebf7bf47b094c7540e2cf2aac0",
          channelName: stream.channelName,
        };
      } catch (error) {
        console.error("startLive Error:", error);

        throw new Error(error.message || "Failed to start live");
      }
    },
  },
};
