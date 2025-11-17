const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    brand: {
      type: Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    // productOffer:{
    //     type:Number,
    //     default:0,
    // },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    material: {
      type: String,
      required: true,
    },
    productImage: {
      type: [String],
      required: true,
    },
    isListed: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Available", "Out of stock", "Discountinued"],
      required: true,
      default: "Available",
    },
    buyLimit: {
      type: Number,
      default: 10, // or whatever you want as default
    },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
