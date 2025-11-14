const mongoose = require("mongoose")
const {Schema} = mongoose;



const brandSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },
      description: {
        type: String,
        required: true,
        trim: true
      },
      isListed: {
        type: Boolean,
        default: true
      },
      isDeleted:{
        type:Boolean,
        default:false
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    });

const Brand = mongoose.model("Brand",brandSchema);
module.exports = Brand;