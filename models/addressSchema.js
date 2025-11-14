const mongoose = require("mongoose");
const {Schema} = mongoose;


const addressSchema = new Schema({
    userId: {
        type:Schema.Types.ObjectId,
        ref:"User",
        required : true
    },
    address: [{
        addressType:{
            type:String,
            required:true,
            enum: ['home', 'office']
        },
        name:{
            type: String,
            required: true,

        },
        city:{
            type:String,
            required :true,
        },
        landmark:{
            type:String,
            required:true,
        },
        state:{
            type:String,
            required:true,
        },
        pincode:{
            type:Number,
            required:true,
        },
        phone:{
            type:String,
            required:true,
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        openSaturday: {
            type: Boolean,
            default: false
        },
        openSunday: {
            type: Boolean,
            default: false
        }
    }],
    selectedAddress: { type: mongoose.Schema.Types.ObjectId, default: null },

}) 

const address = mongoose.model("address",addressSchema);

module.exports = address;