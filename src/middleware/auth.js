const jwt = require("jsonwebtoken");
const cookie = require("cookie");

module.exports = (req) => {

  const cookies = req.headers.cookie
    ? cookie.parse(req.headers.cookie)
    : {};

  const token = cookies.accessToken;  

  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};