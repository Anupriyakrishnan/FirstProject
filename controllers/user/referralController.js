const crypto = require("crypto");
const User = require("../../models/userSchema");

async function generateUniqueReferral(length = 8) {
  while (true) {
    const code = crypto
      .randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length)
      .toUpperCase();

    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
}

const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode || String(referralCode).trim() === "") {
      return res.json({
        valid: false,
        message: "Referral code is required",
      });
    }

    const cleanCode = String(referralCode).trim().toUpperCase();

    const referrerUser = await User.findOne({
      referralCode: cleanCode,
      isBlocked: false,
    }).select("name email referralCode");

    if (!referrerUser) {
      return res.json({
        valid: false,
        message: "Invalid referral code",
      });
    }

    res.json({
      valid: true,
      referrerName: referrerUser.name,
      referrerEmail: referrerUser.email,
      message: `Valid referral from ${referrerUser.name}`,
    });
  } catch (error) {
    res.status(500).json({
      valid: false,
      message: "Server error",
    });
  }
};
module.exports = {
  generateUniqueReferral,
  validateReferralCode,
};
