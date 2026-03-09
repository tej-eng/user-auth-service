require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageDisabled,
} = require("@apollo/server/plugin/landingPage/default");

const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");

const auth = require("./middleware/auth");
const rateLimiter = require("./middleware/rateLimiter");

async function startServer() {
  const app = express();

  /* =========================
     Security Middlewares
  ========================= */

  app.use(helmet());

  app.use(
    cors({
      origin: "*", // change to frontend domain in production
      credentials: true,
    })
  );

  app.use(express.json());

  app.use(rateLimiter);

  /* =========================
     Apollo Server
  ========================= */

  const server = new ApolloServer({
    typeDefs,
    resolvers,

    csrfPrevention: true,

    introspection: process.env.NODE_ENV !== "production",

    plugins: [
      process.env.NODE_ENV === "production"
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ embed: true }),
    ],
  });

  await server.start();

  /* =========================
     GraphQL Route
  ========================= */

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        let user = null;

        try {
          user = auth(req);
        } catch (err) {
          user = null;
        }

        return { req, res, user };
      },
    })
  );

  /* =========================
     Health Check Endpoint
  ========================= */

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "user-auth-service",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  /* =========================
     Start Server
  ========================= */

  const PORT = process.env.PORT || 8007;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });
}

startServer();