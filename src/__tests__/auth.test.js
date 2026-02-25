require("dotenv").config();

const request = require("supertest");
const express = require("express");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

const typeDefs = require("../graphql/typeDefs");
const resolvers = require("../graphql/resolvers");
const redis = require("../config/redis");

const prisma = new PrismaClient();

let app;
let server;

const MOBILE = "9999999999";
let accessToken;
let refreshToken;
let generatedOtp;
let adminToken;
let astrologerId;
let approvedAstrologer;
const contactNo = "9999999999";
beforeAll(async () => {
  
  // ================= CLEAN DATABASE (FK SAFE ORDER) =================
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Address",
      "ExperiencePlatform",
      "Interview",
      "AstrologerDocument",
      "AstrologerRejectionHistory",
      "Astrologer",
      "User",
      "Admin",
      "Role"
    RESTART IDENTITY CASCADE;
  `);

  

  // ================= CLEAN REDIS =================
  await redis.flushall();
console.log("xxxxxxxxxxxxxxxxxx", redis);
  // ================= SETUP EXPRESS + APOLLO =================
  app = express();
  app.use(express.json());

  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        const authHeader = req.headers.authorization;
        let user = null;

        if (authHeader?.startsWith("Bearer ")) {
          try {
            user = jwt.verify(
              authHeader.replace("Bearer ", ""),
              process.env.JWT_SECRET
            );
          } catch {
            user = null;
          }
        }

        return { user, res };
      },
    })
  );

  // ================= CREATE ROLE =================
const role = await prisma.role.create({
  data: {
    name: "ADMIN",
  },
});

// ================= CREATE ADMIN =================
const admin = await prisma.admin.create({
  data: {
    name: "Super Admin",
    email: "admin@test.com",
    password: "hashedpassword",
    phoneNo: "9999999990",
    role: {
      connect: { id: role.id },
    },
  },
});

  adminToken = jwt.sign(
    { id: admin.id, role: "ADMIN" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
 
  await server.stop();
  await prisma.$disconnect();
  await redis.quit();
});

describe("GraphQL USER +ASTROLOGER FLOW", () => {

  // ================= 1. REQUEST OTP =================
  test("1. USER SEND Request OTP", async () => {
    const res = await request(app).post("/graphql").send({
      query: `mutation { requestOtp(mobile: "${MOBILE}") }`,
    });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.requestOtp).toBe(true);
console.log("resssssssssssssss", res.body.data);

    generatedOtp = await redis.get(`otp:${MOBILE}`);
    expect(generatedOtp).toBeDefined();
  });

  it("Request OTP - invalid phone", async () => {
  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          requestOtp(phoneNo: "123") {
            message
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
});


  // ================= 2. LOGIN =================
  test("2. Auth with correct OTP", async () => {
    const res = await request(app).post("/graphql").send({
      query: `
        mutation {
          authWithOtp(mobile: "${MOBILE}", otp: "${generatedOtp}") {
            accessToken
            refreshToken
            user {
              id
              mobile
            }
          }
        }
      `,
    });

    expect(res.body.errors).toBeUndefined();

    accessToken = res.body.data.authWithOtp.accessToken;
    refreshToken = res.body.data.authWithOtp.refreshToken;

    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
    expect(res.body.data.authWithOtp.user.mobile).toBe(MOBILE);
  });

  it("Auth without requesting OTP", async () => {
  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          auth(phoneNo: "9999998888", otp: "123456") {
            accessToken
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
});


  // ================= 3. OTP REPLAY =================
  test("3. OTP cannot be reused", async () => {
    const res = await request(app).post("/graphql").send({
      query: `
        mutation {
          authWithOtp(mobile: "${MOBILE}", otp: "${generatedOtp}") {
            accessToken
          }
        }
      `,
    });

    expect(res.body.errors[0].message).toBe("OTP already used");
  });

  // ================= 4. WRONG OTP =================
  test("4. Wrong OTP", async () => {
    const mobile = "9999999998";

    await request(app).post("/graphql").send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

    const res = await request(app).post("/graphql").send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "000000") {
            accessToken
          }
        }
      `,
    });

    expect(res.body.errors[0].message).toBe("Invalid OTP");
  });

  // ================= 5. EXPIRED OTP =================
  test("5. Expired OTP", async () => {
    const mobile = "9999999997";

    await request(app).post("/graphql").send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

    await redis.del(`otp:${mobile}`);

    const res = await request(app).post("/graphql").send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "123456") {
            accessToken
          }
        }
      `,
    });

    expect(res.body.errors[0].message)
      .toBe("OTP expired or not requested");
  });

  // ================= GET USERS (ADMIN PAGINATION) =================

test("Get users - admin pagination works", async () => {
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      query: `
        query {
          getUsersDetails(page: 1, limit: 5) {
            data {
              id
              mobile
            }
            totalCount
            currentPage
            totalPages
          }
        }
      `,
    });

  expect(res.body.errors).toBeUndefined();
  expect(Array.isArray(res.body.data.getUsersDetails.data)).toBe(true);
  expect(res.body.data.getUsersDetails.currentPage).toBe(1);
  expect(res.body.data.getUsersDetails.totalCount).toBeGreaterThanOrEqual(1);
});

test("Get users - non admin should fail", async () => {
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      query: `
        query {
          getUsersDetails(page: 1, limit: 5) {
            data { id }
          }
        }
      `,
    });

  expect(res.body.errors[0].message).toBe("Admin only");
});


  // ================= 8. REFRESH TOKEN =================
  test("8. Refresh Token", async () => {
    const res = await request(app).post("/graphql").send({
      query: `
        mutation {
          refreshToken(token: "${refreshToken}") {
            accessToken
            refreshToken
          }
        }
      `,
    });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.refreshToken.accessToken).toBeDefined();
  });

  it("Refresh token - invalid token", async () => {
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", "Bearer invalidtoken")
    .send({
      query: `
        mutation {
          refreshToken {
            accessToken
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
});


  // ================= 9. LOGOUT =================
  test("9. USER  Logout", async () => {
    const res = await request(app)
      .post("/graphql")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        query: `mutation { logout }`,
      });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.logout).toBe(true);
  });

  it("Logout - no token", async () => {
  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          logout
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
});

it("Refresh after USER  logout", async () => {
  await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ query: `mutation { logout }` });

  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${refreshToken}`)
    .send({ query: `mutation { refreshToken { accessToken } }` });

  expect(res.body.errors).toBeDefined();
});





});
