// utils/agoraToken.js

const {
  RtcTokenBuilder,
  RtcRole,
} = require("agora-token");

const generateRtcToken = ({
  channelName,
  uid,
  role = "subscriber",
}) => {
  const appId = process.env.AGORA_APP_ID || "3a1816ebf7bf47b094c7540e2cf2aac0";
  const appCertificate =
    process.env.AGORA_APP_CERTIFICATE || "9eb88b8e0f1f481e8602e42c0ee34967";

  const expirationTimeInSeconds = 3600;
  const currentTimestamp =
    Math.floor(Date.now() / 1000);

  const privilegeExpiredTs =
    currentTimestamp +
    expirationTimeInSeconds;

  const rtcRole =
    role === "publisher"
      ? RtcRole.PUBLISHER
      : RtcRole.SUBSCRIBER;

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    rtcRole,
    privilegeExpiredTs
  );
};

module.exports = {
  generateRtcToken,
};