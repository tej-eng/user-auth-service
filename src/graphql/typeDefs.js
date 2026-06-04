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
  

  type AstrologerPricing {
  type: String
  price: Float
  originalPrice: Float
  offerPrice: Float
  appliedOffer: String
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
    tags: String
    vtags: String
    activeOffer: ActiveOffer
    pricing: [AstrologerPricing]
  }

  input AstrologerSearchInput {
    query: String # Search by name / skills / language
    sortField: SortField # Sorting field
    sortOrder: SortOrder # ASC or DESC
    limit: Int # Items per page
    page: Int # Page number
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
    latitude: Float
    longitude: Float
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
    latitude: Float
    longitude: Float
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

  #------------------start for get live chatmessages-----------------------
  type ChatMessage {
    msg_id: String
    sender_id: String
    room_id: String
    received_id: String
    message: String
    image: String
    sender: String
    replyTo: JSON
    time: String
  }
  #-------------------end for get live chatmessages-----------------------

  #------------------start recent intake response-----------------------
  type RecentIntakeResponse {
    success: Boolean
    message: String
    data: [Intake]
  }
  #-------------------end recent intake response-----------------------
  #------------------start code for razorpay order-----------------------

  input CreateOrderInput {
    rechargePackId: String!
  }

  type CreateOrderResponse {
    success: Boolean!
    orderId: String!
    amount: Int!
    currency: String!
  }
  #--------------------end code for razorpay order-----------------------
  #------------------start code for astrologer application-----------------------
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

  input CreateApplicationInput {
    name: String!
    phoneNumber: String!
    email: String
    dob: String!
    gender: String!
    languages: [String!]!
    problems: [String!]!

    skills: [String!]!
    experience: Int!
    about: String
    address: String
    pincode: String
  }
  type AstrologerApplication {
    id: ID!
    name: String
    phoneNumber: String
    email: String
    gender: String
    skills: [String]
    languages: [String]
    problems: [String]

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
  #-------------------start code for astrologer application-----------------------

  #------------------start code for chat history-----------------------

  input UserChatHistoryFilterInput {
    page: Int
    limit: Int

    astrologerName: String
    status: SessionStatus

    startDate: String
    endDate: String
  }

  type UserChatHistoryResponse {
    success: Boolean!
    summary: ChatHistorySummary!
    data: [UserChatHistoryItem!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  type ChatHistorySummary {
    totalCoinsDeducted: Int!
    totalCoinsEarned: Int!
    totalCommission: Int!
    totalRecords: Int!
  }

  type UserChatHistoryItem {
    srNo: Int

    roomId: String
    sessionId: String

    startedAt: String
    endedAt: String
    createdAt: String

    status: String

    durationSec: Int
    durationMinutes: Int

    ratePerMin: Int

    coinsDeducted: Int
    coinsEarned: Int
    commission: Int

    user: ChatUser
    astrologer: ChatAstrologer

    lastMessage: ChatMessage
  }

  type ChatUser {
    id: String
    name: String
    mobile: String
    countryCode: String
  }

  type ChatAstrologer {
    id: String
    name: String
    profilePic: String
    experience: Int
    rating: Float
    skills: [String]
    languages: [String]
  }

  #--------------------End code for chat history-----------------------

  #------------------start code for call history-----------------------

  input UserCallHistoryFilterInput {
    page: Int
    limit: Int

    astrologerName: String
    status: SessionStatus

    startDate: String
    endDate: String
  }

  type UserCallHistoryResponse {
    success: Boolean!
    summary: ChatHistorySummary!
    data: [UserCallHistoryItem!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  type UserCallHistoryItem {
    srNo: Int

    sessionId: String

    startedAt: String
    endedAt: String
    createdAt: String

    status: String

    durationSec: Int
    durationMinutes: Int

    ratePerMin: Int

    coinsDeducted: Int
    coinsEarned: Int
    commission: Int

    user: ChatUser
    astrologer: ChatAstrologer
  }

  #--------------------End code for call history-----------------------

  #------------------ START GIFT SECTION ------------------

  type Gift {
    id: ID!
    name: String!
    amount: Float!
    image: String
    status: String
    createdAt: String
    updatedAt: String
  }

  type GiftResponse {
    data: [Gift!]!
    totalCount: Int!
  }

  #------------------ END GIFT SECTION ------------------
  #------------------ START BANNER SECTION ------------------

  type Banner {
    id: ID!
    heading: String
    subheading: String
    slug: String
    sortorder: Int
    bannerlink: String
    language: String
    imageUrl: String
    status: Boolean
    createdAt: String
    updatedAt: String
  }

  type BannerResponse {
    data: [Banner!]!
    totalCount: Int!
  }

  #------------------ END BANNER SECTION ------------------
  #------------------ START FAQ SECTION ------------------

  type Faq {
    id: ID!
    question: String!
    answer: String!
    createdAt: String
    updatedAt: String
  }

  type FaqResponse {
    data: [Faq!]!
    totalCount: Int!
  }

  #------------------ END FAQ SECTION ------------------

  #------------------ START TESTIMONIAL SECTION ------------------

  type Testimonial {
    id: ID!
    name: String!
    address: String
    content: String!
    image: String
    rating: Int
    createdAt: String
    updatedAt: String
  }

  type TestimonialResponse {
    data: [Testimonial!]!
    totalCount: Int!
  }

  #------------------ END TESTIMONIAL SECTION ------------------
  #------------------ START ABOUT PAGE SECTION ------------------
  type MentorFounder {
    name: String
    image: String
    description: String
    designation: String
  }

  type AboutPage {
    id: ID!
    pageType: String
    heroTitle: String
    heroDescription: String

    mentors: [MentorFounder]
    founders: [MentorFounder]

    metaTitle: String
    metaDescription: String
    keywords: [String]

    status: String

    createdAt: String
    updatedAt: String
  }
  #------------------ END ABOUT PAGE SECTION ------------------
  #------------------ START REMEDY SECTION ------------------
  type Remedy {
    id: ID!
    title: String!
    description: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type RemedyResponse {
    data: [Remedy!]!
    totalCount: Int!
  }
  #-----------------------------------------
  #------------------START APP VERSION SECTION ------------------
  enum PlatformType {
    ANDROID
    IOS
  }

  type AppVersion {
    id: ID!
    platform: PlatformType!
    latestVersion: String
    minimumVersion: String

    forceUpdate: Boolean
    maintenanceMode: Boolean
    maintenanceMessage: String

    playStoreUrl: String
    appStoreUrl: String

    releaseNotes: String

    createdAt: String
    updatedAt: String
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
    getAstrologerListBySearch(
      searchInput: AstrologerSearchInput
    ): AstrologerPagination!
    getAstrologerListForUser(
    searchInput: AstrologerSearchInput
  ): AstrologerPagination!
    getRechargePacks: RechargePackResponse!
    getRechargePackById(id: ID!): RechargePack
    me: User
    getUserById(id: String!): UserBasicInfo
    getAstrologerById(id: String!): Astrologer
    getNextChatRequest(astrologerId: String!): ChatQueueItem
    skipChatRequest(astrologerId: String!): Boolean
    getUserWallet: UserWallet
    getUserProfile: User
    getUserWalletTransactions(
      filter: WalletTransactionFilter
    ): WalletTransactionResponse

    getUserChatHistory(
      filter: UserChatHistoryFilterInput
    ): UserChatHistoryResponse

    getUserSessions(filter: SessionFilterInput): ChatSessionResponse
    getChatMessages(roomId: String!): [ChatMessage]
    recentIntakes: RecentIntakeResponse
    getChatMessagesBySessionId(sessionId: String!): [ChatMessage]

    getUserCallHistory(
      filter: UserCallHistoryFilterInput
    ): UserCallHistoryResponse

    getGifts: GiftResponse!

    getBanners(language: String): BannerResponse!

    getFaqs: FaqResponse!

    getTestimonials: TestimonialResponse!

    getRemedies: RemedyResponse!

    getAboutPage: AboutPage

    getAppVersion(platform: PlatformType!): AppVersion

    getFreeServices: FreeServiceResponse!

    getFreeServiceById(id: ID!): FreeService
  }

  type Mutation {
    requestOtp(countryCode: String!, mobile: String!): OtpResponse!
    authWithOtp(
      countryCode: String!
      mobile: String!
      otp: String!
    ): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    deleteUser(id: ID!): Boolean
    updateUserProfile(input: UpdateUserInput!): User!
    createIntake(input: IntakeInput!): CreateIntakeResponse!
    createReview(input: CreateReviewInput!): CreateReviewResponse!
    uploadImage(file: Upload!): UploadResponse
    createOrder(input: CreateOrderInput!): CreateOrderResponse!
    createAstrologerApplication(
      input: CreateApplicationInput!
    ): AstrologerApplication!
  }
`;
