const { default: mongoose } = require("mongoose");
const mongoosh = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: function () {
      return this.isNew && !this.googleId;
    },
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  cart: [
    {
      type: Schema.Types.ObjectId,
      ref: "Cart",
    },
  ],
  wallet: {
    type: Schema.Types.ObjectId,
    ref: "Wallet",
    default: null
  },
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
  ],
  createOn: {
    type: Date,
    default: () => Date.now(),
  },
  referredBy: {
    type: String, // store referral code or ref to userId
    default: null
  },
  referralCode: {
    type: String,
    unique: true,    // unique for non-null values
    sparse: true,    // allow multiple docs with no field / null
    default: null
  },
  referralLink: {
    type: String,
    default: null
  },
  redeemed: {
    type: Boolean,
    default: false,
  },
  redeemedUsers: [{
  type: Schema.Types.ObjectId,
  ref: "User",
}],
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
      brand: {
        type: String,
      },
      searchOn: {
        type: Date,
        default: () => Date.now(),
      },
    },
  ],
  profileImage: {
    type: String,
    default: "",
  },
  firstName: {
    type: String,
    default: "",
  },
  lastName: {
    type: String,
    default: "",
  },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other", "Not provided"],
    default: "Not provided",
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
