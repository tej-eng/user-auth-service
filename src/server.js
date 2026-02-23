require("dotenv").config();

const express = require("express");
const cors = require("cors");
//const helmet = require("helmet");

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginLandingPageLocalDefault,
} = require("@apollo/server/plugin/landingPage/default");

const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");
const authMiddleware = require("./middleware/auth");
const rateLimiter = require("./middleware/rateLimiter");
const cookie = require("cookie");
const auth = require("./middleware/auth");

async function startServer() {
  const app = express();

  //app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(rateLimiter);

  const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req, res }) => {
    const authHeader = req.headers["authorization"];
    let user = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");

      try {
        
        user = verifyAccessToken(token);
      } catch (err) {
        user = null;
      }
    }

    return { req, res, user };
  },
});


  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: ({ req, res }) => {
      const user = auth(req); 
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
