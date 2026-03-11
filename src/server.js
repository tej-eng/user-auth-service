require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");

const {
  ApolloServerPluginLandingPageLocalDefault,
} = require("@apollo/server/plugin/landingPage/default");

const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");

const auth = require("./middleware/auth");
const rateLimiter = require("./middleware/rateLimiter");

async function startServer() {
  const app = express();

  /* =========================
     Trust Proxy (important when using Apache/Nginx)
  ========================= */

  app.set("trust proxy", true);

  /* =========================
     Security Middlewares
  ========================= */

  app.use(helmet());

 app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://dhwaniastro.com"
    ],
    credentials: true
  })
);
   app.use(cookieParser());
  app.use(express.json());

  /* =========================
     Rate Limiting
  ========================= */

  app.use(rateLimiter);

  /* =========================
     Apollo Server Setup
  ========================= */

  const server = new ApolloServer({
    typeDefs,
    resolvers,

    csrfPrevention: true,

    introspection: process.env.NODE_ENV !== "production",

    plugins:
      process.env.NODE_ENV !== "production"
        ? [ApolloServerPluginLandingPageLocalDefault({ embed: true })]
        : [],
  });

  await server.start();

  /* =========================
     GraphQL Endpoint
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

        return {
          req,
          res,
          user,
        };
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
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();