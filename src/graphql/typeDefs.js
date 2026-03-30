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
    countryCode: String 
    mobile: String
    gender: Gender
    birthDate: String
    birthTime: String
    occupation: String
    isActive: Boolean
    isDeleted: Boolean
    user_status: Int
    createdAt: String
    updatedAt: String
  }

 type AuthPayload {
  user: User!
  accessToken: String!
  refreshToken: String!
  isNewUser: Boolean!
  hasName: Boolean!
}
  type OtpResponse {
  message: String!
  otp: String
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
  status: Boolean
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
#------------START CODE FOR WALLET TRANSACTION----------------
type WalletTransaction {
  id: ID!
  userWalletId: String
  type: String
  coins: Int
  amount: Float
  description: String
  createdAt: String
}

type WalletTransactionResponse {
  data: [WalletTransaction]
  totalCount: Int
  currentPage: Int
  totalPages: Int
}
#--------END CODE FOR WALLET TRANSACTION----------------
# -----------------------------------------
# End Astrologer Search Section
# -----------------------------------------
# -----------------------------------------
# start recharge pack section
# -----------------------------------------
type RechargePack {
  id: ID!
  name: String!
  description: String
  price: Float!
  coins: Int!
  talktime: Int!
  validityDays: Int!
  createdAt: String!
}

type RechargePackResponse {
  data: [RechargePack!]!
  totalCount: Int!
}
# -----------------------------------------
# End recharge pack section
# -----------------------------------------


# -----------------------------------------
# Intake Section
# -----------------------------------------
type CreateIntakeResponse {
  roomId: String!
  chatTime: Int!
  intakeId: String!
}
input IntakeInput {
  astrologerId: String!
  name: String!
  countryCode: String!
  mobile: String!
  gender: Gender!
  birthDate: String!
  birthTime: String!
  occupation: String!
  birthPlace: String!
  requestType: String!
}
type Intake {
  id: ID!
  name: String!
  countryCode: String
  mobile: String!
  gender: Gender!
  birthDate: String!
  birthTime: String!
  occupation: String!
  birthPlace: String!
  requestType: String!
  chatId: String
  createdAt: String!
}
#------------------------------------------
#end intake section

#-----------------------------------------
# Get User by ID (for admin or internal use)
#-----------------------------------------
type UserBasicInfo {
  id: ID!
  name: String
  countryCode: String 
  mobile: String
  gender: Gender
  birthDate: String
  birthTime: String
  occupation: String
  isActive: Boolean
  isDeleted: Boolean
  createdAt: String
  updatedAt: String
  wallet: UserWallet
}
  type UserWallet {
  id: ID!
  balanceCoins: Float
  createdAt: String
  updatedAt: String
}
#---------END--------------------------------
#-----------------------------------------
# start session section
#-----------------------------------------
enum SessionType {
  CHAT
  CALL
}
  enum SessionStatus {
  ONGOING
  COMPLETED
  CANCELLED
}
type Session {
  id: ID!

  userId: String!
  astrologerId: String!

  type: SessionType!
  status: SessionStatus!

  ratePerMin: Int
  durationSec: Int

  coinsDeducted: Int
  coinsEarned: Int
  commission: Int

  startedAt: String
  endedAt: String

  createdAt: String
}
 
#-end session section ------------------

#-----------------start queue section------------------------
type ChatQueueItem {
  roomId: String!
  userId: String!
  astrologerId: String!
  createdAt: String!
}
#---------End Queue Section-------------------
#--------start get user wallet----------------
type UserWallet {
  id: ID!
  userId: String!
  balanceCoins: Float!
  lockedCoins: Float!
  createdAt: String!
  updatedAt: String!
}
#---------End get user wallet----------------
#-----------start review-------------------
input CreateReviewInput {
  astro_id: String!
  review_id: String
  star: Int!
  comment: String
  user_name: String
  astro_name: String
}
type CreateReviewResponse {
  success: Boolean!
  message: String!
}
#--------------end review-------------
  type Query {
  getUsersDetails(page: Int, limit: Int, search: String): UserPagination!
  getAstrologerListBySearch(searchInput: AstrologerSearchInput): AstrologerPagination!
  getRechargePacks: RechargePackResponse!
  getRechargePackById(id: ID!): RechargePack
  me: User
  getUserById(id: String!): UserBasicInfo
  getAstrologerById(id: String!): Astrologer
  getNextChatRequest(astrologerId: String!): ChatQueueItem
  skipChatRequest(astrologerId: String!): Boolean
  getUserWallet: UserWallet
  getUserProfile: User
  getWalletTransactions(
    page: Int
    limit: Int
    type: String
    fromDate: String
    toDate: String
  ): WalletTransactionResponse
  
  
  }

  type Mutation {
    requestOtp(countryCode: String!, mobile: String!): OtpResponse!
    authWithOtp(countryCode: String!, mobile: String!, otp: String!): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    deleteUser(id: ID!): Boolean
    updateUserProfile(input: UpdateUserInput!): User!
    createIntake(input: IntakeInput!): CreateIntakeResponse!
    createReview(input: CreateReviewInput!): CreateReviewResponse!
}
`;
