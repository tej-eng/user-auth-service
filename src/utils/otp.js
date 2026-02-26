function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();}

function otpExpiryTime() {
  return new Date(Date.now() + 5 * 60 * 1000); 
}

module.exports = { generateOtp, otpExpiryTime };

