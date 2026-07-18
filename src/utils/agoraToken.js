const {
  RtcTokenBuilder,
  RtcRole,
} = require("agora-token");

const axios = require("axios");

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

const AGORA_CHAT_ORG = process.env.AGORA_CHAT_ORG ;
const AGORA_CHAT_APP = process.env.AGORA_CHAT_APP;

const AGORA_CHAT_CLIENT_ID = process.env.AGORA_CHAT_CLIENT_ID || "";
const AGORA_CHAT_CLIENT_SECRET = process.env.AGORA_CHAT_CLIENT_SECRET || "";

/**
 * RTC TOKEN
 */
const generateRtcToken = ({
  channelName,
  uid,
  role = "subscriber",
}) => {
  const expirationTimeInSeconds = 3600;

  const currentTimestamp = Math.floor(Date.now() / 1000);

  const privilegeExpiredTs =
    currentTimestamp + expirationTimeInSeconds;

  const rtcRole =
    role === "publisher"
      ? RtcRole.PUBLISHER
      : RtcRole.SUBSCRIBER;

  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    rtcRole,
    privilegeExpiredTs
  );
};

/**
 * Get Agora App Token
 */
const getAgoraChatAppToken = async () => {
  const { data } = await axios.post(
    `https://a61.chat.agora.io/${AGORA_CHAT_ORG}/${AGORA_CHAT_APP}/token`,
    {
      grant_type: "client_credentials",
      client_id: AGORA_CHAT_CLIENT_ID,
      client_secret: AGORA_CHAT_CLIENT_SECRET,
    }
  );

  return data.access_token;
};

/**
 * Create Chat User (ignore if already exists)
 */
const createAgoraChatUser = async (username) => {
  const appToken = await getAgoraChatAppToken();

  try {
    await axios.post(
      `https://a61.chat.agora.io/${AGORA_CHAT_ORG}/${AGORA_CHAT_APP}/users`,
      {
        username,
        password: "123456",
      },
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
        },
      }
    );
  } catch (err) {
    // User already exists
    if (
      err.response &&
      err.response.data &&
      err.response.data.error === "duplicate_unique_property_exists"
    ) {
      return;
    }

    throw err;
  }
};

/**
 * Generate User Chat Token
 */
const generateChatToken = async (username) => {
  const appToken = await getAgoraChatAppToken();

  const { data } = await axios.post(
    `https://a61.chat.agora.io/${AGORA_CHAT_ORG}/${AGORA_CHAT_APP}/token`,
    {
      grant_type: "password",
      username,
      password: "123456",
    },
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    }
  );

  return data.access_token;
};

module.exports = {
  generateRtcToken,
  createAgoraChatUser,
  generateChatToken,
};