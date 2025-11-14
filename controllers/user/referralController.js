
const crypto = require('crypto');
const User = require('../../models/userSchema'); // adjust path

async function generateUniqueReferral(length = 8) {
  // returns UPPERCASE alphanumeric hex-string of requested length
  while (true) {
    const code = crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length)
      .toUpperCase();

    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
    // else loop to try new code (very unlikely to loop many times)
  }
}

const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode || String(referralCode).trim() === "") {
      return res.json({
        valid: false,
        message: "Referral code is required"
      });
    }

    const cleanCode = String(referralCode).trim().toUpperCase();

    // Find user with this referral code
    const referrerUser = await User.findOne({
      referralCode: cleanCode,
      isBlocked: false
    }).select("name email referralCode");

    if (!referrerUser) {
      console.log("❌ Referral code not found:", cleanCode);
      return res.json({
        valid: false,
        message: "Invalid referral code"
      });
    }

    console.log("✅ Referral code valid:", cleanCode);
    console.log("   Referrer:", referrerUser.name);

    res.json({
      valid: true,
      referrerName: referrerUser.name,
      referrerEmail: referrerUser.email,
      message: `Valid referral from ${referrerUser.name}`
    });
  } catch (error) {
    console.error("Error validating referral code:", error);
    res.status(500).json({
      valid: false,
      message: "Server error"
    });
  }
};
module.exports = {
  generateUniqueReferral,
  validateReferralCode,
}