// src/__tests__/auth.test.js
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

beforeAll(async () => {
  // ================= CLEAN DATABASE =================
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

await prisma.rechargePack.deleteMany(); // clean first

await prisma.rechargePack.createMany({
  data: [
    {
      name: "Basic Pack",
      description: "Test Pack",
      price: 100,
      coins: 1000,
      talktime: 60,
      validityDays: 30,
      isActive: true,
    },
  ],
});

  await redis.flushall();

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

  const role = await prisma.role.create({ data: { name: "ADMIN" } });

  const admin = await prisma.admin.create({
    data: {
      name: "Super Admin",
      email: "admin@test.com",
      password: "hashedpassword",
      phoneNo: "9999999990",
      role: { connect: { id: role.id } },
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

describe("GraphQL USER + ASTROLOGER FLOW", () => {

  beforeEach(async () => {
    await redis.flushall();
  });
let userAccessToken;
  // ================= 1. REQUEST OTP =================
  test("1. USER SEND Request OTP", async () => {
    const res = await request(app)
      .post("/graphql")
      .send({
        query: `mutation { requestOtp(mobile: "${MOBILE}") }`,
      });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.requestOtp).toBe("OTP sent successfully");

    generatedOtp = await redis.get(`otp:${MOBILE}`);
    expect(generatedOtp).toBeDefined();
  });

  test("Request OTP - invalid phone", async () => {
    const res = await request(app)
      .post("/graphql")
      .send({
        query: `mutation { requestOtp(mobile: "123") }`,
      });

    expect(res.body.errors).toBeDefined();
  });

  // ================= 2. AUTH WITH CORRECT OTP =================
  test("2. Auth with correct OTP", async () => {
    await request(app)
      .post("/graphql")
      .send({
        query: `mutation { requestOtp(mobile: "${MOBILE}") }`,
      });

    const otp = await redis.get(`otp:${MOBILE}`);

    const res = await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            authWithOtp(mobile: "${MOBILE}", otp: "${otp}") {
              accessToken
              refreshToken
              user { id mobile }
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

  // ================= 3. AUTH WITHOUT REQUESTING OTP =================
  test("3. Auth without requesting OTP", async () => {
    const res = await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            authWithOtp(mobile: "9999998888", otp: "123456") {
              accessToken
            }
          }
        `,
      });

    expect(res.body.errors).toBeDefined();
    expect(res.body.data.authWithOtp).toBeNull();
  });

  // ================= 4. OTP CANNOT BE REUSED =================
  test("4. OTP cannot be reused", async () => {

    const reuseMobile = "9999911111";

    // Step 1: Request OTP
    await request(app)
      .post("/graphql")
      .send({
        query: `mutation { requestOtp(mobile: "${reuseMobile}") }`,
      });

    const otp = await redis.get(`otp:${reuseMobile}`);
    expect(otp).toBeDefined();

    // Step 2: First Login (SUCCESS)
    const firstLogin = await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            authWithOtp(mobile: "${reuseMobile}", otp: "${otp}") {
              accessToken
            }
          }
        `,
      });

    expect(firstLogin.body.errors).toBeUndefined();
    expect(firstLogin.body.data.authWithOtp.accessToken).toBeDefined();

    // Step 3: Reuse Same OTP (FAIL)
    const secondLogin = await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            authWithOtp(mobile: "${reuseMobile}", otp: "${otp}") {
              accessToken
            }
          }
        `,
      });

    expect(secondLogin.body.errors).toBeDefined();
    expect(secondLogin.body.errors[0].message).toBe("OTP already used");
    expect(secondLogin.body.data.authWithOtp).toBeNull();
  });

  test("5. Expired OTP should fail", async () => {
  const mobile = "9999922222";

  // Request OTP
  await request(app)
    .post("/graphql")
    .send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

  const otp = await redis.get(`otp:${mobile}`);
  expect(otp).toBeDefined();

  // Simulate expiry
  await redis.del(`otp:${mobile}`);

  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "${otp}") {
            accessToken
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
  expect(res.body.data.authWithOtp).toBeNull();
});

test("6. Too many failed OTP attempts", async () => {
  const mobile = "9999933333";

  await request(app)
    .post("/graphql")
    .send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

  // Try wrong OTP multiple times
  for (let i = 0; i < 6; i++) {
    await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            authWithOtp(mobile: "${mobile}", otp: "000000") {
              accessToken
            }
          }
        `,
      });
  }

  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "000000") {
            accessToken
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
  expect(res.body.errors[0].message).toBe("Too many failed attempts.");
});

it("Authenticated user can update own profile", async () => {
  console.log("Access Token for update profile test:", accessToken);
  const mutation = `
    mutation updateUserProfile($input: UpdateUserInput!) {
      updateUserProfile(input: $input) {
        id
        name
        gender
        birthDate
        birthTime
        occupation
      }
    }
  `;

  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${accessToken}`) 
    .send({
      query: mutation,
      variables: {
        input: {
          name: "Updated User",
          gender: "MALE",
          birthDate: "1995-05-15",
          birthTime: "10:30",
          occupation: "Software Engineer",
        },
      },
    });
    //console.log("Update Profile Response:", res.body.data.updateUserProfile);
 expect(res.body.errors).toBeUndefined();
expect(res.body.data.updateUserProfile.name).toBe("Updated User");
expect(res.body.data.updateUserProfile.occupation).toBe("Software Engineer");
});
test("7. Refresh token generates new access token", async () => {
  const mobile = "9999944444";

  await request(app)
    .post("/graphql")
    .send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

  const otp = await redis.get(`otp:${mobile}`);

  const loginRes = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "${otp}") {
            accessToken
            refreshToken
          }
        }
      `,
    });

  const refreshToken = loginRes.body.data.authWithOtp.refreshToken;

  const refreshRes = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          refreshToken(token: "${refreshToken}") {
            accessToken
          }
        }
      `,
    });

  expect(refreshRes.body.errors).toBeUndefined();
  expect(refreshRes.body.data.refreshToken.accessToken).toBeDefined();
});


test("9. USER Logout", async () => {
  const mobile = "9999955555";

  // Step 1: Request OTP
  await request(app)
    .post("/graphql")
    .send({
      query: `mutation { requestOtp(mobile: "${mobile}") }`,
    });

  const otp = await redis.get(`otp:${mobile}`);
  expect(otp).toBeDefined();

  // Step 2: Login (IMPORTANT: include user id)
  const loginRes = await request(app)
    .post("/graphql")
    .send({
      query: `
        mutation {
          authWithOtp(mobile: "${mobile}", otp: "${otp}") {
            accessToken
            refreshToken
            user {
              id
            }
          }
        }
      `,
    });

  expect(loginRes.body.errors).toBeUndefined();

  const token = loginRes.body.data.authWithOtp.accessToken;
  const userId = loginRes.body.data.authWithOtp.user.id;

  expect(userId).toBeDefined();

  // Step 3: Logout
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${token}`)
    .send({ query: `mutation { logout }` });

  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.logout).toBe(true);

  // Step 4: Verify refreshToken removed
  const user = await prisma.user.findUnique({
    where: { id: userId }, 
  });

  expect(user).not.toBeNull();
  expect(user.refreshToken).toBeNull();
});

test("Refresh after USER logout", async () => {
    // logout user first
    await request(app)
      .post("/graphql")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ query: `mutation { logout }` });

    const res = await request(app)
      .post("/graphql")
      .send({ query: `mutation { refreshToken(token: "${refreshToken}") { accessToken } }` });

    expect(res.body.errors).toBeDefined();
  });

  // ================= 10. SEARCH USERS BY MOBILE =================
test("10. Get user list - search by mobile with pagination", async () => {

  // 🔹 Create multiple users manually
  await prisma.user.createMany({
    data: [
      { mobile: "8888800001" },
      { mobile: "8888800002" },
      { mobile: "7777700001" },
      { mobile: "6666600001" },
    ],
  });

  // 🔹 Search for users starting with 88888
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${adminToken}`) // if admin protected
    .send({
      query: `
        query {
          getUsersDetails(page: 1, limit: 10, search: "88888") {
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

  console.log("Search Response:", res.body);

  expect(res.body.errors).toBeUndefined();

  const users = res.body.data.getUsersDetails.data;

  expect(users.length).toBe(2);
  expect(res.body.data.getUsersDetails.totalCount).toBe(2);

  users.forEach(user => {
    expect(user.mobile).toContain("88888");
  });

  expect(res.body.data.getUsersDetails.currentPage).toBe(1);
  expect(res.body.data.getUsersDetails.totalPages).toBe(1);
});

test("Public astrologer list - no auth required", async () => {
  const res = await request(app).post("/graphql").send({
    query: `
      query {
        getAstrologerListBySearch(
          searchInput: { query: "Vedic", limit: 5, page: 1 }
        ) {
          totalCount
          data {
            name
          }
        }
      }
    `,
  });

  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.getAstrologerListBySearch.data).toBeDefined();
});

test("11. Unauthorized user cannot access recharge packs", async () => {
  const res = await request(app)
    .post("/graphql")
    .send({
      query: `
        query {
          getRechargePacks {
            data {
              id
              name
            }
            totalCount
          }
        }
      `,
    });

  expect(res.body.errors).toBeDefined();
  expect(res.body.errors[0].message).toBe("Unauthorized. Please login.");
});
test("Authenticated user can fetch active recharge packs", async () => {

  await prisma.rechargePack.deleteMany();

  await prisma.rechargePack.create({
    data: {
      name: "Basic Pack",
      description: "Test Pack",
      price: 100,
      coins: 1000,
      talktime: 60,
      validityDays: 30,
      isActive: true,
    },
  });

  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      query: `
        query {
          getRechargePacks {
            data { id name price }
            totalCount
          }
        }
      `,
    });

  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.getRechargePacks.data.length).toBeGreaterThan(0);
});

});