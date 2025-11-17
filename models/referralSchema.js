const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
  },
  referredUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from creation
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Generate unique referral code
referralSchema.statics.generateUniqueReferralCode = async function () {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const codeLength = 8;
  let code;
  let isUnique = false;

  while (!isUnique) {
    code = "";
    for (let i = 0; i < codeLength; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const existingReferral = await this.findOne({ referralCode: code });
    if (!existingReferral) {
      isUnique = true;
    }
  }
  return code;
};

// Method to add referred user
referralSchema.methods.addReferredUser = async function (userId) {
  if (!this.referredUsers.includes(userId)) {
    this.referredUsers.push(userId);
    await this.save();
  }
};

module.exports = mongoose.model("Referral", referralSchema);
