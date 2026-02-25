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
    user_status: Int
  }

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
  }
 
  type UserPagination {
  data: [User!]!
  totalCount: Int!
  currentPage: Int!
  totalPages: Int!
}
  # -----------------------------------------
  # User update input for profile management (optional)
  # -----------------------------------------
  input UpdateUserInput {
  name: String
  gender: Gender
  birthDate: String
  birthTime: String
  occupation: String
}
  # -----------------------------------------
  # End user update input section
  # -----------------------------------------
# -----------------------------------------
# Astrologer Public Search Configuration
# -----------------------------------------


type Astrologer {
  id: ID!
  name: String
  experience: Int
  price: Float
  rating: Float
  skills: [String]
  languages: [String]
  profilePic: String
}

input AstrologerSearchInput {
  query: String        # Search by name / skills / language
  sortField: SortField # Sorting field
  sortOrder: SortOrder # ASC or DESC
  limit: Int           # Items per page
  page: Int            # Page number
}

enum SortField {
  EXPERIENCE
  PRICE
  RATING
}

enum SortOrder {
  ASC
  DESC
}

type AstrologerPagination {
  data: [Astrologer!]!
  totalCount: Int!
  currentPage: Int!
  totalPages: Int!
}

# -----------------------------------------
# End Astrologer Search Section
# -----------------------------------------
  type Query {
  me: User
  getUsersDetails(page: Int, limit: Int, search: String): UserPagination!
  getAstrologerListBySearch(searchInput: AstrologerSearchInput): AstrologerPagination!
  }

  type Mutation {
    requestOtp(mobile: String!): String
    authWithOtp(mobile: String!, otp: String!): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    deleteUser(id: ID!): Boolean
    updateUserProfile(input: UpdateUserInput!): User!
  }
`;
