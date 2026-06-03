const { gql } = require("graphql-tag");
console.log("TYPEDEFS LOADED ✅");
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

  input IntakeInput {
    astrologerId: String!
    name: String!
    mobile: String!
    gender: Gender!
    birthDate: String!
    birthTime: String!
    occupation: String!
    birthPlace: String!
    requestType: String!
    chatId: String
  }

  type Intake {
    id: ID!
    name: String!
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

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
    isNewUser: Boolean!
    hasName: Boolean!
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

type AstrologerPricing {
  type: String
  price: Float
  offerPrice: Float
  commissionPercent: Float
  isActive: Boolean
}
type ActiveOffer {
  id: ID!
  offerName: String!
  price: Float!
  description: String
}
type Astrologer {
  id: ID
  profilePic: String
  name: String
  experience: Int
  rating: Float
  skills: [String]
  languages: [String]
  about: String
  tags : String
  vtags :String
  activeOffer: ActiveOffer
  pricing: [AstrologerPricing]
}

input AstrologerSearchInput {
  query: String        # Search by name / skills / language
  sortField: SortField # Sorting field
  sortOrder: SortOrder # ASC or DESC
  limit: Int           # Items per page
  page: Int            # Page number
  type: PricingType
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
  astrologerWalletId: String
  rechargePackId: String
  sessionId: String

  type: String
  coins: Int
  amount: Float
  description: String

  astrologerName: String   
  createdAt: String
}

type WalletTransactionResponse {
  data: [WalletTransaction]
  totalCount: Int
  currentPage: Int
  totalPages: Int
}
  input WalletTransactionFilter {
  page: Int
  limit: Int
  type: [String]   
  fromDate: String
  toDate: String
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

enum PricingType {
  CHAT
  CALL
  VIDEO
  AUDIO
}

type CreateIntakeResponse {
  roomId: String!
  chatTime: Int!
  intakeId: String!
  message: String

  # NEW
  pricePerMin: Float
  pricingType: PricingType
  appliedOffer: String
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

  # OPTIONAL ADDITIONS
  pricePerMin: Float
  pricingType: PricingType

  createdAt: String!
}

#------------------------------------------
# end intake section

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

#---------END--------------------------------
#-----------------------------------------
# start session section
#-----------------------------------------
enum SessionType {
  CHAT
  CALL
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
#----------- START REVIEW -------------------

type Review {
  id: ID!

  userId: String!
  astrologerId: String!

  sessionId: String

  rating: Int!
  comment: String
  reply: String

  isFlagged: Boolean

  userName: String
  astroName: String

  createdAt: String
  updatedAt: String
}

input CreateReviewInput {
  astro_id: String!
  star: Int!
  comment: String
}

type CreateReviewResponse {
  success: Boolean!
  message: String!
  review: Review
}

#----------- END REVIEW -------------------
#--------------end review-------------
#--------------start chat history----------------
scalar JSON

type Message {
  id: String!
  msgId: String
  roomId: String
  senderId: String
  receiverId: String
  message: String
  image: String
  sender: String
  replyTo: JSON
  sessionId: String
  createdAt: String
}

type ChatHistory {
  roomId: String!
  sessionId: String

  startedAt: String
  endedAt: String
  status: String

  user: User
  astrologer: Astrologer

  lastMessage: Message
}
#------END chat history-----
#----------------------------start GetUser Sessions----------
enum SessionStatus {
  REQUESTED
  ACCEPTED
  ONGOING
  COMPLETED
  CANCELLED
  FAILED
}

input SessionFilterInput {
  status: SessionStatus
  fromDate: String
  toDate: String
  page: Int
  limit: Int
}

type ChatSession {
  id: ID

  userName: String
  astrologerName: String
  astrologerImage: String

  startedAt: String
  endedAt: String

  durationSec: Int
  durationMin: Int

  ratePerMin: Int
  ratePerSecond: Float

  totalCharge: Float
  coinsEarned: Int
  commission: Int

  status: SessionStatus
}

type ChatSessionResponse {
  data: [ChatSession]
  totalCount: Int
  currentPage: Int
  totalPages: Int
}



#-----------------------ENd user sessions-----------------

#--------------upload image response----------------
scalar Upload

type UploadResponse {
  url: String
  filename: String
}
#-------------------End upload image response---------

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
    query: String # Search by name / skills / language
    sortField: SortField # Sorting field
    sortOrder: SortOrder # ASC or DESC
    limit: Int # Items per page
    page: Int # Page number
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
  type OtpResponse {
    message: String!
    otp: String
  }

  # -----------------------------------------
  # End Astrologer Search Section
  # -----------------------------------------
  # -----------------------------------------
  # start recharge pack section
  # -----------------------------------------
  input RechargePackInput {
    name: String!
    description: String
    price: Float!
    talktime: Int!
    isActive: Boolean
  }

  type RechargePack {
    id: ID!
    name: String!
    description: String
    price: Float!
    talktime: Int!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type RechargePackResponse {
    data: [RechargePack!]!
    totalCount: Int!
  }

  #-----new astrologer registeration----#
  type AstrologerApplication {
    id: ID!
    name: String
    phoneNumber: String
    email: String
    gender: String
    skills: [String]
    languages: [String]
    experience: Int
    applicationStatus: String!
    interviewStatus: String
    interviewRemarks: String
    documentStatus: DocumentStatus
    approvalStatus: ApprovalStatus

    interviewerId: String
    interviewDate: String
    interviewTime: String
    round: Int

    createdAt: String
  }

input CreateApplicationInput {
  name: String!
  phoneNumber: String!
  email: String
  dob: String!
  gender: String!
  languages: [String!]!
  skills: [String!]!
  experience: Int!
  about: String
  address: String
  pincode: String
}


  enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum InterviewStatus {
  PENDING
  SCHEDULED
  PASSED
  REJECTED
}

enum DocumentStatus {
  PENDING
  VERIFIED
  REJECTED
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}
 #--------END APP VERSION SECTION --------------------
 #------------START free services section----------------

 type FreeService {
  id: ID!
  title: String!
  slug: String!
  href: String!
  icon: String!
  isActive: Boolean!
  order: Int!
  createdAt: String!
  updatedAt: String!
}

type FreeServiceResponse {
  data: [FreeService!]!
  totalCount: Int!
}

 #------------END free services section----------------
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
  getUserWalletTransactions(filter: WalletTransactionFilter): WalletTransactionResponse
  
 getUserChatHistory(
  filter: UserChatHistoryFilterInput
): UserChatHistoryResponse

  getUserSessions(filter: SessionFilterInput): ChatSessionResponse
  getChatMessages(roomId: String!): [ChatMessage]
  recentIntakes: RecentIntakeResponse
   getChatMessagesBySessionId(
    sessionId: String!
  ): [ChatMessage]

  # -----------------------------------------
  # End recharge pack section
  # -----------------------------------------

  getFreeServices: FreeServiceResponse!

  getFreeServiceById(id: ID!): FreeService

  
  }

  type Mutation {
    requestOtp(mobile: String!): OtpResponse!
    authWithOtp(mobile: String!, otp: String!): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    deleteUser(id: ID!): Boolean
    updateUserProfile(input: UpdateUserInput!): User!
    createIntake(input: IntakeInput!): Intake!
    createAstrologerApplication(
      input: CreateApplicationInput!
    ): AstrologerApplication!

   
}
`;
