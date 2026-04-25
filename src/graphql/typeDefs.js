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

  # -----------------------------------------
  # End recharge pack section
  # -----------------------------------------

  type Query {
    me: User
    getUsersDetails(page: Int, limit: Int, search: String): UserPagination!
    getAstrologerListBySearch(
      searchInput: AstrologerSearchInput
    ): AstrologerPagination!
    getRechargePacks: RechargePackResponse!
    getRechargePackById(id: ID!): RechargePack
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
