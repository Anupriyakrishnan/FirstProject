const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");
const Product = require("./productSchema");

const orderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  orderedItem: [
    {
      Product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      price: {
        type: Number,
        default: 0,
      },
      totalPrice: {
        type: Number,
        default: 0,
      },
      cancellationReason: { type: String, default: "" },
      returnReason: { type: String, default: "" },
      status: {
        type: String,
        enum: [
          "pending",
          "confirmed",
          "cancelled",
          "returned",
          "returnrequest",
          "delivered",
        ],
        default: "pending",
      },
      requestedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  totalPrice: {
    type: Number,
    required: true,
  },
  offerDiscount: {
    type: Number,
  },
  couponDiscount: {
    type: Number,
  },
  discount: {
    type: Number,
    default: 0,
  },
  finalAmount: {
    type: Number,
    required: true,
  },
  address: {
    addressType: { type: String },
    name: { type: String },
    city: { type: String },
    landmark: { type: String },
    state: { type: String },
    pincode: { type: Number },
    phone: { type: String },
    isDefault: { type: Boolean },
    openSaturday: { type: Boolean },
    openSunday: { type: Boolean },
  },
  invoiceDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "returned",
      "returnrequest",
    ],
    default: "pending",
  },
  createOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  couponApplied: {
    type: Boolean,
    default: false,
  },
  paymentMethod: {
    type: String,
    default: "Cash on Delivery",
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
