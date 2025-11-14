const mongoose = require("mongoose");
const Product = require("./productSchema");
const {Schema} = mongoose;

const wishlistSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    Product:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:"Product",
            required:true
        },
        addedOn:{
            type:Date,
            default:Date.now
        }
    }]
})

const Wishlist = mongoose.model("wishlist",wishlistSchema);
module.exports = Wishlist;