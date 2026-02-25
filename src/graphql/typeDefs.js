const { gql } = require("graphql-tag");

module.exports = gql`


  enum Gender {
    MALE
    FEMALE
    OTHER
  }
  
  type User {
    id: ID!
    name: String
    mobile: String
    gender: Gender
    birthDate: String
    birthTime: String
    occupation: String
    isActive: Boolean
    isDeleted: Boolean
    createdAt: String
    updatedAt: String
  }

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
  }
 
  type PaginatedUsers {
  data: [User!]!
  totalCount: Int!
  currentPage: Int!
  totalPages: Int!
}

type Query {
  me: User
  getUsersDetails(page: Int, limit: Int): PaginatedUsers!
}

  type Mutation {
    requestOtp(mobile: String!): Boolean
    authWithOtp(mobile: String!, otp: String!): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    deleteUser(id: ID!): Boolean
  }
`;
