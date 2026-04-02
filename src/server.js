require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginLandingPageLocalDefault,
} = require("@apollo/server/plugin/landingPage/default");

const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");
const rateLimiter = require("./middleware/rateLimiter");
const { verifyAccessToken } = require("./config/jwt");

async function startServer() {
  const app = express();

  app.use(
    cors({
      origin: [
      "http://localhost:3000",
      "https://dhwaniastro.com",
      /https:\/\/dhwani-astro-v2.*\.vercel\.app/  
    ],
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json());
  app.use(rateLimiter);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
  });

  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        const token = req.cookies?.accessToken;
         console.log("Access token:", token);
        let user = null;

        if (token) {
          try {
            user = verifyAccessToken(token);
            console.log("Authenticated user:", user);
          } catch {
            user = null;
          }
        }

        return { req, res, user };
      },
    })
  );

  const PORT = process.env.PORT || 4000;

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/graphql`);
  });
}

startServer();