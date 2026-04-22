require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
 const helmet = require("helmet");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginLandingPageLocalDefault,
} = require("@apollo/server/plugin/landingPage/default");

const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");
const rateLimiter = require("./middleware/rateLimiter");
const { verifyAccessToken } = require("./config/jwt");
const aiAnalysisRoute = require("./routes/aiAnalysis");

async function startServer() {
  const app = express();
app.use(
  cors({
   origin: ["http://localhost:3000"],
    credentials: true,
  })
);
 
app.use(helmet());

  app.use(cookieParser());
  app.use(express.json());
  app.use(rateLimiter);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
  });

  await server.start();

app.use("/api", aiAnalysisRoute);

  app.use(
    "/graphql",
    expressMiddleware(server, {
  context: async ({ req, res }) => {
  const token = req.cookies?.accessToken;

  let user = null;

  if (token) {
    try {
      user = verifyAccessToken(token);
    } catch {
      user = null;
    }
  }

  return { user, prisma }; // ✅ FIX
},
    })
  );

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/graphql`);
  });
}

startServer();