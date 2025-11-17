const mongoose = require("mongoose");
const { Schema } = mongoose;

const offerSchema = new Schema({
  productItem: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      offerName: {
        type: String,
        required: true,
      },
      discount: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
    },
  ],
  categoryItem: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
      offerName: {
        type: String,
        required: true,
      },
      discount: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
    },
  ],
  couponItem: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      code: {
        type: String,
        required: true,
        unique: true,
      },
      discount: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      issuedAt: {
        type: Date,
        default: Date.now,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
    },
  ],
});

const Offer = mongoose.model("Offer", offerSchema);
module.exports = Offer;
