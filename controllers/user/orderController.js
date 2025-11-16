const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const { selectAddress } = require("./profileController");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongoose").Types;
const mongoose = require("mongoose");

const Razorpay = require("razorpay");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, // Replace with your Razorpay Key ID
  key_secret: process.env.RAZORPAY_SECRET, // Replace with your Razorpay Key Secret
});

function generateOrderId() {
  const prefix = "TMLX";
  const numbers = Math.floor(10000000 + Math.random() * 90000000); // Ensures 8-digit number
  return prefix + numbers;
}

const ordersuccesspage = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;

    if (!userId || !ObjectId.isValid(userId)) {
      console.error(
        "User not authenticated: Invalid or missing user ID in session",
        userId
      );
      return res.redirect("/login?message=Please log in to view your order");
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error(`User not found for ID: ${userId}`);
      return res.redirect("/login?message=User not found");
    }

    if (user.isBlocked) {
      console.error(`User ${userId} is blocked`);
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.redirect(
        "/login?message=Your account is blocked. Please contact support."
      );
    }

    const selectedAddress = req.session.order;

    if (!selectedAddress) {
      console.error(`No address selected for user ${userId}`);
      return res.redirect("/cart?message=Please select an address");
    }

    const order = await Order.findById(selectedAddress.orderId).populate(
      "orderedItem.Product"
    );
    if (!order || !ObjectId.isValid(order)) {
      console.error(`No valid orderId found in session for user ${userId}`);
      return res.redirect(
        "/cart?message=No recent order found. Please place an order."
      );
    }

    if (!order) {
      console.error(`No order found for ID: ${order}`);
      return res.redirect(
        "/cart?message=No recent order found. Please place an order."
      );
    }

    const cartItems = order.orderedItem.map((item) => ({
      Product: item.Product,
      quantity: item.quantity,
      price: item.price,
      discountedPrice: item.discountedPrice || item.price, // Fallback to price if undefined
      totalPrice: item.totalPrice || item.price * item.quantity, // Fallback to original total
      offer: item.offer || null,
      couponDiscount: item.couponDiscount || 0,
    }));
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    res.render("ordersuccess", {
      user,
      order,
      cartItems,
      selectedAddress,
      cartCount,
    });
  } catch (error) {
    console.error("Error in loadorder:", error);
    res.status(500).render("error", {
      message: "Server error. Please try again.",
      error: error.message,
    });
  }
};

const orderfailurepage = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;

    if (!userId || !ObjectId.isValid(userId)) {
      console.error("User not authenticated:", userId);
      return res.redirect("/login?message=Please log in to view your order");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login?message=User not found");
    }

    if (user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.redirect(
        "/login?message=Your account is blocked. Please contact support."
      );
    }

    const selectedAddress = req.session.order;
    if (!selectedAddress) {
      return res.redirect("/cart?message=Please select an address");
    }

    const order = await Order.findById(selectedAddress.orderId).populate(
      "orderedItem.Product"
    );
    if (!order) {
      return res.redirect(
        "/cart?message=No recent order found. Please place an order."
      );
    }

    const cartItems = order.orderedItem.map((item) => ({
      Product: item.Product,
      quantity: item.quantity,
      price: item.price,
      discountedPrice: item.discountedPrice || item.price,
      totalPrice: item.totalPrice || item.price * item.quantity,
      offer: item.offer || null,
      couponDiscount: item.couponDiscount || 0,
    }));

    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length;
      }
    }

    res.render("orderfailure", {
      user,
      order,
      cartItems,
      selectedAddress,
      cartCount,
    });
  } catch (error) {
    console.error("Error in orderfailurepage:", error);
    res.status(500).render("error", {
      message: "Server error. Please try again.",
      error: error.message,
    });
  }
};

// const createOrder= async (req, res) => {
//     try {
//         const userId = req.session.user?._id || req.session.user;
//         if (!userId || !ObjectId.isValid(userId)) {
//             return res.status(401).json({ success: false, message: 'Please log in to place an order' });
//         }

//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         if (user.isBlocked) {
//             req.session.destroy((err) => {
//                 if (err) console.error('Error destroying session:', err);
//             });
//             return res.status(403).json({ success: false, message: 'Your account is blocked. Please contact support.' });
//         }

//         const { selectedAddress } = req.session.order || {};
//         if (!selectedAddress || !selectedAddress._id) {
//             return res.status(400).json({ success: false, message: 'Address is missing' });
//         }

//         const cart = await Cart.findOne({ userId }).populate({
//             path: 'items.productId',
//             match: { isBlocked: false, isListed: true }, // Match loadpayment filtering
//             select: 'salePrice category',
//             populate: { path: 'category', select: '_id' }
//         });
//         if (!cart || cart.items.length === 0) {
//             return res.status(400).json({ success: false, message: 'Your cart is empty' });
//         }

//         // Filter out items with undefined productId
//         const validCartItems = cart.items.filter(item => item.productId && ObjectId.isValid(item.productId._id));
//         if (validCartItems.length === 0) {
//             console.error(`No valid products in cart for user ${userId}`);
//             return res.status(400).json({ success: false, message: 'No valid products in cart' });
//         }

//         // Log invalid items for debugging
//         if (validCartItems.length < cart.items.length) {
//             console.warn(`Filtered out ${cart.items.length - validCartItems.length} invalid cart items for user ${userId}`);
//         }

//         // Fetch active offers
//         const currentDate = new Date();
//         const offers = await Offer.find({
//             $or: [
//                 { "productItem.endDate": { $gt: currentDate }, "productItem.startDate": { $lte: currentDate } },
//                 { "categoryItem.endDate": { $gt: currentDate }, "categoryItem.startDate": { $lte: currentDate } },
//             ],
//         });

//         // Process cart items with offers
//         let offerDiscount = 0;
//         const orderedItems = validCartItems.map((item) => {
//             let applicableOffer = null;
//             let maxDiscount = 0;
//             let discountedPrice = item.productId.salePrice;

//             // Product-specific offer
//             offers.forEach((offer) => {
//                 offer.productItem.forEach((productItem) => {
//                     if (
//                         productItem.product.toString() === item.productId._id.toString() &&
//                         new Date(productItem.startDate) <= currentDate &&
//                         new Date(productItem.endDate) > currentDate
//                     ) {
//                         if (productItem.discount > maxDiscount) {
//                             maxDiscount = productItem.discount;
//                             applicableOffer = {
//                                 discount: productItem.discount,
//                                 offerName: productItem.offerName,
//                                 type: "Product Offer",
//                             };
//                             discountedPrice = item.productId.salePrice * (1 - productItem.discount / 100);
//                         }
//                     }
//                 });
//             });

//             // Category-specific offer
//             offers.forEach((offer) => {
//                 offer.categoryItem.forEach((categoryItem) => {
//                     if (
//                         categoryItem.category.toString() === item.productId.category?._id.toString() &&
//                         new Date(categoryItem.startDate) <= currentDate &&
//                         new Date(categoryItem.endDate) > currentDate
//                     ) {
//                         if (categoryItem.discount > maxDiscount) {
//                             maxDiscount = categoryItem.discount;
//                             applicableOffer = {
//                                 discount: categoryItem.discount,
//                                 offerName: categoryItem.offerName,
//                                 type: "Category Offer",
//                             };
//                             discountedPrice = item.productId.salePrice * (1 - categoryItem.discount / 100);
//                         }
//                     }
//                 });
//             });

//             const itemOfferDiscount = (item.productId.salePrice - discountedPrice) * item.quantity;
//             offerDiscount += itemOfferDiscount;

//             return {
//                 Product: item.productId._id,
//                 quantity: item.quantity,
//                 price: item.productId.salePrice,
//                 discountedPrice: Math.round(discountedPrice * 100) / 100,
//                 totalPrice: Math.round(discountedPrice * item.quantity * 100) / 100,
//                 offer: applicableOffer,
//                 couponDiscount: 0 // Will be updated below
//             };
//         });

//         // Calculate total price before coupon
//         let totalPrice = orderedItems.reduce((total, item) => total + (item.totalPrice || 0), 0);

//         // Apply coupon discount if any
//         let couponDiscount = 0;
//         let appliedCoupon = null;
//         if (req.session.appliedCoupon) {
//             const offer = await Offer.findOne({
//                 "couponItem.code": req.session.appliedCoupon.code,
//                 "couponItem.expiresAt": { $gte: new Date() },
//                 "couponItem.user": { $ne: userId }
//             });
//             if (offer) {
//                 const coupon = offer.couponItem.find(c => c.code === req.session.appliedCoupon.code);
//                 if (coupon && coupon.discount <= totalPrice) {
//                     couponDiscount = coupon.discount;
//                     appliedCoupon = {
//                         code: coupon.code,
//                         discount: coupon.discount,
//                         expiryDate: coupon.expiresAt
//                     };

//                     // Distribute coupon discount proportionally
//                     const totalItemsPrice = orderedItems.reduce((sum, item) => sum + item.totalPrice, 0);
//                     orderedItems.forEach((item) => {
//                         const itemContribution = item.totalPrice / totalItemsPrice;
//                         const itemCouponDiscount = couponDiscount * itemContribution;
//                         item.couponDiscount = Math.round(itemCouponDiscount * 100) / 100;
//                         item.discountedPrice = Math.round((item.discountedPrice - itemCouponDiscount / item.quantity) * 100) / 100;
//                         item.totalPrice = Math.round(item.discountedPrice * item.quantity * 100) / 100;
//                     });
//                 } else {
//                     console.warn(`Invalid or expired coupon for user ${userId}: ${req.session.appliedCoupon.code}`);
//                     req.session.appliedCoupon = null;
//                 }
//             } else {
//                 console.warn(`No valid coupon found for code: ${req.session.appliedCoupon.code}`);
//                 req.session.appliedCoupon = null;
//             }
//         }

//         // Recalculate total price after coupon
//         totalPrice = orderedItems.reduce((total, item) => total + (item.totalPrice || 0), 0);

//         // const finalAmount = totalPrice - offerDiscount - couponDiscount;
//         const paymentMethod = req.body.paymentMethod || 'Cash on Delivery';
//         const orderId = generateOrderId();

//         let discount = offerDiscount || couponDiscount ;
//         const finalAmount = totalPrice;

//         const order = new Order({
//             orderId,
//             userId,
//             orderedItem: orderedItems,
//             totalPrice: orderedItems.reduce((total, item) => total + (item.price * item.quantity), 0),
//             offerDiscount,
//             couponDiscount,
//             discount,
//             finalAmount: totalPrice,
//             address: selectedAddress,
//             invoiceDate: new Date(),
//             status: 'pending',
//             createOn: new Date(),
//             couponApplied: !!appliedCoupon,
//             appliedCoupon,
//             paymentMethod,
//         });

//         await order.save();

//         // Update product quantities
//         for (const item of orderedItems) {
//             await Product.findByIdAndUpdate(item.Product, {
//                 $inc: { quantity: -item.quantity },
//             });
//         }

//         req.session.order = { orderId: order._id, selectedAddress, totalPrice, offerDiscount, couponDiscount, appliedCoupon, cartItems: orderedItems ,finalAmount};

//         if (paymentMethod === 'Cash on Delivery' || paymentMethod === 'Wallet') {
//             await Cart.findOneAndUpdate({ userId }, { items: [] });
//             return res.json({ success: true, redirect: '/ordersuccess' });
//         }

//         // Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: totalPrice * 100, // Convert to paise
//             currency: 'INR',
//             receipt: `order_${order._id}`,
//         }).catch(err => {
//             console.error('Razorpay order creation error:', err);
//             throw new Error('Failed to create Razorpay order');
//         });

//         order.razorpayOrderId = razorpayOrder.id;
//         await order.save();

//         res.json({ success: true, order: razorpayOrder, orderId: order._id });
//     } catch (error) {
//         console.error('Error creating order:', error);
//         res.status(500).json({ success: false, message: 'Server error. Please try again.' });
//     }
// };

// const createOrder = async (req, res) => {
//     try {
//         const userId = req.session.user?._id || req.session.user;
//         if (!userId || !ObjectId.isValid(userId)) {
//             return res.status(401).json({ success: false, message: 'Please log in to place an order' });
//         }

//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         if (user.isBlocked) {
//             req.session.destroy((err) => {
//                 if (err) console.error('Error destroying session:', err);
//             });
//             return res.status(403).json({ success: false, message: 'Your account is blocked. Please contact support.' });
//         }

//         const { selectedAddress } = req.session.order || {};
//         if (!selectedAddress || !selectedAddress._id) {
//             return res.status(400).json({ success: false, message: 'Address is missing' });
//         }

//         const cart = await Cart.findOne({ userId }).populate({
//             path: 'items.productId',
//             match: { isBlocked: false, isListed: true },
//             select: 'salePrice category',
//             populate: { path: 'category', select: '_id' }
//         });

//         if (!cart || cart.items.length === 0) {
//             return res.status(400).json({ success: false, message: 'Your cart is empty' });
//         }

//         const validCartItems = cart.items.filter(item => item.productId && ObjectId.isValid(item.productId._id));
//         if (validCartItems.length === 0) {
//             console.error(`No valid products in cart for user ${userId}`);
//             return res.status(400).json({ success: false, message: 'No valid products in cart' });
//         }

//         if (validCartItems.length < cart.items.length) {
//             console.warn(`Filtered out ${cart.items.length - validCartItems.length} invalid cart items for user ${userId}`);
//         }

//         // Fetch active offers
//         const currentDate = new Date();
//         const offers = await Offer.find({
//             $or: [
//                 { "productItem.endDate": { $gt: currentDate }, "productItem.startDate": { $lte: currentDate } },
//                 { "categoryItem.endDate": { $gt: currentDate }, "categoryItem.startDate": { $lte: currentDate } },
//             ],
//         });

//         // Process cart items with offers
//         let offerDiscount = 0;
//         const orderedItems = validCartItems.map((item) => {
//             let applicableOffer = null;
//             let maxDiscount = 0;
//             let discountedPrice = item.productId.salePrice;

//             // Product-specific offer
//             offers.forEach((offer) => {
//                 offer.productItem.forEach((productItem) => {
//                     if (
//                         productItem.product.toString() === item.productId._id.toString() &&
//                         new Date(productItem.startDate) <= currentDate &&
//                         new Date(productItem.endDate) > currentDate
//                     ) {
//                         if (productItem.discount > maxDiscount) {
//                             maxDiscount = productItem.discount;
//                             applicableOffer = {
//                                 discount: productItem.discount,
//                                 offerName: productItem.offerName,
//                                 type: "Product Offer",
//                             };
//                             discountedPrice = item.productId.salePrice * (1 - productItem.discount / 100);
//                         }
//                     }
//                 });
//             });

//             // Category-specific offer
//             offers.forEach((offer) => {
//                 offer.categoryItem.forEach((categoryItem) => {
//                     if (
//                         categoryItem.category.toString() === item.productId.category?._id.toString() &&
//                         new Date(categoryItem.startDate) <= currentDate &&
//                         new Date(categoryItem.endDate) > currentDate
//                     ) {
//                         if (categoryItem.discount > maxDiscount) {
//                             maxDiscount = categoryItem.discount;
//                             applicableOffer = {
//                                 discount: categoryItem.discount,
//                                 offerName: categoryItem.offerName,
//                                 type: "Category Offer",
//                             };
//                             discountedPrice = item.productId.salePrice * (1 - categoryItem.discount / 100);
//                         }
//                     }
//                 });
//             });

//             const itemOfferDiscount = (item.productId.salePrice - discountedPrice) * item.quantity;
//             offerDiscount += itemOfferDiscount;

//             return {
//                 Product: item.productId._id,
//                 quantity: item.quantity,
//                 price: item.productId.salePrice,
//                 discountedPrice: Math.round(discountedPrice * 100) / 100,
//                 totalPrice: Math.round(discountedPrice * item.quantity * 100) / 100,
//                 offer: applicableOffer,
//                 couponDiscount: 0 // Will be updated below if coupon is applied
//             };
//         });

//         // Calculate total price after offers
//         let totalPrice = orderedItems.reduce((total, item) => total + (item.totalPrice || 0), 0);

//         // Apply coupon discount if any
//         let couponDiscount = 0;
//         let appliedCoupon = null;
//         if (req.session.appliedCoupon) {
//             const offer = await Offer.findOne({
//                 "couponItem.code": req.session.appliedCoupon.code,
//                 "couponItem.expiresAt": { $gte: new Date() },
//                 "couponItem.user": { $ne: userId }
//             });
//             if (offer) {
//                 const coupon = offer.couponItem.find(c => c.code === req.session.appliedCoupon.code);
//                 if (coupon && coupon.discount <= totalPrice) {
//                     couponDiscount = coupon.discount;
//                     appliedCoupon = {
//                         code: coupon.code,
//                         discount: coupon.discount,
//                         expiryDate: coupon.expiresAt
//                     };

//                     // Distribute coupon discount proportionally
//                     const totalItemsPrice = orderedItems.reduce((sum, item) => sum + item.totalPrice, 0);
//                     orderedItems.forEach((item) => {
//                         const itemContribution = item.totalPrice / totalItemsPrice;
//                         const itemCouponDiscount = couponDiscount * itemContribution;
//                         item.couponDiscount = Math.round(itemCouponDiscount * 100) / 100;
//                         item.discountedPrice = Math.round((item.discountedPrice - itemCouponDiscount / item.quantity) * 100) / 100;
//                         item.totalPrice = Math.round(item.discountedPrice * item.quantity * 100) / 100;
//                     });
//                 } else {
//                     console.warn(`Invalid or expired coupon for user ${userId}: ${req.session.appliedCoupon.code}`);
//                     req.session.appliedCoupon = null;
//                 }
//             } else {
//                 console.warn(`No valid coupon found for code: ${req.session.appliedCoupon.code}`);
//                 req.session.appliedCoupon = null;
//             }
//         }

//         // ✅ RECALCULATE: Final total after BOTH offers and coupon
//         const finalAmount = orderedItems.reduce((total, item) => total + (item.totalPrice || 0), 0);

//         const paymentMethod = req.body.paymentMethod || 'Cash on Delivery';
//         const orderId = generateOrderId();

//         // ✅ FIX: Calculate original total (before any discounts)
//         const originalTotal = validCartItems.reduce((total, item) => total + (item.productId.salePrice * item.quantity), 0);

//         // ✅ FIX: Total discount includes both offer and coupon
//         const totalDiscount = offerDiscount + couponDiscount;

//         // ✅ FIX: Final amount is the total price after ALL discounts
//         // const finalAmount = Math.round(totalPrice * 100) / 100;

//         console.log('=== ORDER SUMMARY ===');
//         console.log(`Original Total: ₹${originalTotal}`);
//         console.log(`Offer Discount: ₹${offerDiscount}`);
//         console.log(`Coupon Discount: ₹${couponDiscount}`);
//         console.log(`Total Discount: ₹${totalDiscount}`);
//         console.log(`Final Amount: ₹${finalAmount}`);
//         console.log('====================');

//         const order = new Order({
//             orderId,
//             userId,
//             orderedItem: orderedItems,
//             totalPrice: originalTotal,  // Original price before discounts
//             offerDiscount,
//             couponDiscount,
//             discount: totalDiscount,    // Total discount (offer + coupon)
//             finalAmount,                // ✅ Final amount after all discounts
//             address: selectedAddress,
//             invoiceDate: new Date(),
//             status: 'pending',
//             createOn: new Date(),
//             couponApplied: !!appliedCoupon,
//             appliedCoupon,
//             paymentMethod,
//         });

//         await order.save();

//         // Update product quantities
//         for (const item of orderedItems) {
//             await Product.findByIdAndUpdate(item.Product, {
//                 $inc: { quantity: -item.quantity },
//             });
//         }

//         req.session.order = {
//             orderId: order._id,
//             selectedAddress,
//             totalPrice: finalAmount,  // ✅ Use final amount here
//             offerDiscount,
//             couponDiscount,
//             appliedCoupon,
//             cartItems: orderedItems,
//             finalAmount
//         };

//         if (paymentMethod === 'Cash on Delivery' || paymentMethod === 'Wallet') {
//             await Cart.findOneAndUpdate({ userId }, { items: [] });
//             return res.json({ success: true, redirect: '/ordersuccess' });
//         }

//         // Create Razorpay order with final amount (after all discounts)
//         const razorpayOrder = await razorpay.orders.create({
//             amount: Math.round(finalAmount * 100),  // ✅ Convert to paise
//             currency: 'INR',
//             receipt: `order_${order._id}`,
//         }).catch(err => {
//             console.error('Razorpay order creation error:', err);
//             throw new Error('Failed to create Razorpay order');
//         });

//         order.razorpayOrderId = razorpayOrder.id;
//         await order.save();

//         res.json({ success: true, order: razorpayOrder, orderId: order._id });
//     } catch (error) {
//         console.error('Error creating order:', error);
//         res.status(500).json({ success: false, message: 'Server error. Please try again.' });
//     }
// };

// const verifyRazorpay = async (req,res)=>{
//     const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

//     const orderId = req.session.order.orderId || null

//     try {
//         const order = await Order.findOne({ _id: orderId });
//         if (!order) {
//             return res.status(404).json({ success: false, message: 'Order not found' });
//         }

//         const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET)
//             .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//             .digest('hex');

//         if (generatedSignature === razorpay_signature) {
//             await Order.findByIdAndUpdate(order._id, {
//                 status: 'pending',
//                 paymentId: razorpay_payment_id,
//             });
//             await Cart.findOneAndUpdate({ userId: order.userId }, { items: [] });
//             res.json({ success: true, redirect: `/ordersuccess?orderId=${order._id}` });
//         } else {
//             res.status(400).json({ success: false,  message: 'Invalid payment signature' });

//         }
//     } catch (error) {
//         console.error('Error verifying payment:', error);
//         res.status(500).json({ success: false, message: 'Server error' });
//     }
// }

// ===== FIX 3: createOrder - Mark coupon as used after successful order =====
const createOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;

    if (!userId || !ObjectId.isValid(userId)) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to place an order" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res
        .status(403)
        .json({
          success: false,
          message: "Your account is blocked. Please contact support.",
        });
    }

    const { selectedAddress } = req.session.order || {};
    if (!selectedAddress || !selectedAddress._id) {
      return res
        .status(400)
        .json({ success: false, message: "Address is missing" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isBlocked: false, isListed: true },
      select: "salePrice category",
      populate: { path: "category", select: "_id" },
    });

    if (!cart || cart.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }

    const validCartItems = cart.items.filter(
      (item) => item.productId && ObjectId.isValid(item.productId._id)
    );
    if (validCartItems.length === 0) {
      console.error(`No valid products in cart for user ${userId}`);
      return res
        .status(400)
        .json({ success: false, message: "No valid products in cart" });
    }

    // Fetch active offers
    const currentDate = new Date();
    const offers = await Offer.find({
      $or: [
        {
          "productItem.endDate": { $gt: currentDate },
          "productItem.startDate": { $lte: currentDate },
        },
        {
          "categoryItem.endDate": { $gt: currentDate },
          "categoryItem.startDate": { $lte: currentDate },
        },
      ],
    });

    // Process cart items with offers
    let offerDiscount = 0;
    const orderedItems = validCartItems.map((item) => {
      let applicableOffer = null;
      let maxDiscount = 0;
      let discountedPrice = item.productId.salePrice;

      // Product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((productItem) => {
          if (
            productItem.product.toString() === item.productId._id.toString() &&
            new Date(productItem.startDate) <= currentDate &&
            new Date(productItem.endDate) > currentDate
          ) {
            if (productItem.discount > maxDiscount) {
              maxDiscount = productItem.discount;
              applicableOffer = {
                discount: productItem.discount,
                offerName: productItem.offerName,
                type: "Product Offer",
              };
              discountedPrice =
                item.productId.salePrice * (1 - productItem.discount / 100);
            }
          }
        });
      });

      // Category-specific offer
      offers.forEach((offer) => {
        offer.categoryItem.forEach((categoryItem) => {
          if (
            categoryItem.category.toString() ===
              item.productId.category?._id.toString() &&
            new Date(categoryItem.startDate) <= currentDate &&
            new Date(categoryItem.endDate) > currentDate
          ) {
            if (categoryItem.discount > maxDiscount) {
              maxDiscount = categoryItem.discount;
              applicableOffer = {
                discount: categoryItem.discount,
                offerName: categoryItem.offerName,
                type: "Category Offer",
              };
              discountedPrice =
                item.productId.salePrice * (1 - categoryItem.discount / 100);
            }
          }
        });
      });

      const itemOfferDiscount =
        (item.productId.salePrice - discountedPrice) * item.quantity;
      offerDiscount += itemOfferDiscount;

      return {
        Product: item.productId._id,
        quantity: item.quantity,
        price: item.productId.salePrice,
        discountedPrice: Math.round(discountedPrice * 100) / 100,
        totalPrice: Math.round(discountedPrice * item.quantity * 100) / 100,
        offer: applicableOffer,
        couponDiscount: 0,
      };
    });

    // Calculate total after offers
    let totalAfterOffers = orderedItems.reduce(
      (total, item) => total + (item.totalPrice || 0),
      0
    );

    // ✅ FIX: Apply coupon discount ONLY if valid
    let couponDiscount = 0;
    let appliedCoupon = null;

    if (req.session.appliedCoupon) {
      // ✅ Double-check: User hasn't used this coupon before
      const coupon = await Coupon.findOne({
        name: req.session.appliedCoupon.code,
        isList: true,
        expireOn: { $gte: new Date() },
        userId: { $nin: [userId] }, // ✅ CRITICAL: Ensure user hasn't used this coupon
      });

      if (coupon && totalAfterOffers >= coupon.minimunPrice) {
        couponDiscount = coupon.offerPrice;
        appliedCoupon = {
          code: coupon.name,
          discount: coupon.offerPrice,
          expiryDate: coupon.expireOn,
        };

        console.log(
          `✅ Applying coupon ${coupon.name} - Discount: ₹${couponDiscount}`
        );
      } else {
        if (!coupon) {
          console.warn(
            `❌ Coupon validation failed - User may have already used this coupon`
          );
        }
        req.session.appliedCoupon = null;
        couponDiscount = 0;
        appliedCoupon = null;
      }
    }

    // ✅ Calculate final amounts
    const originalTotal = validCartItems.reduce(
      (total, item) => total + item.productId.salePrice * item.quantity,
      0
    );

    // ✅ Final amount = Total after offers - Coupon discount
    const finalAmount = totalAfterOffers - couponDiscount;
    const totalDiscount = offerDiscount + couponDiscount;

    console.log("=== ORDER SUMMARY ===");
    console.log(`Original Total: ₹${originalTotal}`);
    console.log(`Offer Discount: ₹${offerDiscount}`);
    console.log(`After Offers: ₹${totalAfterOffers}`);
    console.log(`Coupon Discount: ₹${couponDiscount}`);
    console.log(`Total Discount: ₹${totalDiscount}`);
    console.log(`Final Amount: ₹${finalAmount}`);
    console.log("====================");

    const paymentMethod = req.body.paymentMethod || "Cash on Delivery";
    const orderId = generateOrderId();

    const order = new Order({
      orderId,
      userId,
      orderedItem: orderedItems,
      totalPrice: originalTotal,
      offerDiscount,
      couponDiscount,
      discount: totalDiscount,
      finalAmount,
      address: selectedAddress,
      invoiceDate: new Date(),
      status: "pending",
      createOn: new Date(),
      couponApplied: !!appliedCoupon,
      appliedCoupon,
      paymentMethod,
    });

    await order.save();
    console.log(`✅ Order ${orderId} created successfully`);

    // ✅ CRITICAL: Mark coupon as used ONLY after order is saved
    if (appliedCoupon) {
      await Coupon.updateOne(
        { name: appliedCoupon.code },
        { $addToSet: { userId: userId } }
      );
      console.log(
        `✅ Coupon ${appliedCoupon.code} marked as used by user ${userId}`
      );
    }

    // Update product quantities
    for (const item of orderedItems) {
      await Product.findByIdAndUpdate(item.Product, {
        $inc: { quantity: -item.quantity },
      });
    }

    req.session.order = {
      orderId: order._id,
      selectedAddress,
      totalPrice: finalAmount,
      offerDiscount,
      couponDiscount,
      appliedCoupon,
      cartItems: orderedItems,
      finalAmount,
    };

    // ✅ Clear applied coupon from session
    req.session.appliedCoupon = null;

    if (paymentMethod === "Cash on Delivery" || paymentMethod === "Wallet") {
      await Cart.findOneAndUpdate({ userId }, { items: [] });
      return res.json({ success: true, redirect: "/ordersuccess" });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders
      .create({
        amount: Math.round(finalAmount * 100),
        currency: "INR",
        receipt: `order_${order._id}`,
      })
      .catch((err) => {
        console.error("Razorpay order creation error:", err);
        throw new Error("Failed to create Razorpay order");
      });

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({ success: true, order: razorpayOrder, orderId: order._id });
  } catch (error) {
    console.error("Error creating order:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error. Please try again." });
  }
};

// ===== FIX 4: verifyRazorpay - Also clear coupon session =====
const verifyRazorpay = async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
    req.body;
  const orderId = req.session.order.orderId || null;

  try {
    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature === razorpay_signature) {
      await Order.findByIdAndUpdate(order._id, {
        status: "pending",
        paymentId: razorpay_payment_id,
      });
      await Cart.findOneAndUpdate({ userId: order.userId }, { items: [] });

      // ✅ Clear coupon session after successful payment
      req.session.appliedCoupon = null;

      res.json({
        success: true,
        redirect: `/ordersuccess?orderId=${order._id}`,
      });
    } else {
      res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const loadorder = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId || !ObjectId.isValid(userId)) {
      return res.redirect("/login?message=Please log in to view your orders");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/login?message=User not found");
    }

    if (user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.redirect(
        "/login?message=Your account is blocked. Please contact support."
      );
    }
    const orders = await Order.find({ userId })
      .populate({
        path: "orderedItem.Product",
        populate: [
          { path: "brand", select: "name" },
          { path: "category", select: "name" },
        ],
      })
      .lean()
      .sort({ createOn: -1 });

    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    res.render("orders", {
      user,
      orders,
      cartCount,
    });
  } catch (error) {
    console.error("Error in loadorder:", error);
    res.status(500).render("error", {
      message: "Server error. Please try again.",
      error: error.message,
    });
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId || !ObjectId.isValid(userId)) {
      console.error(
        "User not authenticated: Invalid or missing user ID in session",
        userId
      );
      return res.redirect("/login?message=Please log in to view order details");
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error(`User not found for ID: ${userId}`);
      return res.redirect("/login?message=User not found");
    }

    if (user.isBlocked) {
      console.error(`User ${userId} is blocked`);
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.redirect(
        "/login?message=Your account is blocked. Please contact support."
      );
    }

    const orders = await Order.find({ userId })
      .populate("orderedItem.Product")
      .lean();

    if (!orders || orders.length === 0) {
      return res.redirect("/orders?message=No orders found");
    }

    const orderId = req.query.id;

    const order = orderId
      ? orders.find((o) => o.orderId.toString() === orderId)
      : orders[0];

    if (!order) {
      return res.redirect("/orders?message=Order not found");
    }

    const cartItems = order.orderedItem.map((item) => ({
      _id: item._id,
      Product: item.Product,
      quantity: item.quantity,
      price: item.price,
      status: item.status,
    }));

    let cancelledTotal = 0;
    let itemsTotal = 0;

    order.orderedItem.forEach((item) => {
      itemsTotal += item.totalPrice * item.quantity;
      if (item.status === "returned" || item.status === "cancelled") {
        cancelledTotal += item.totalPrice * item.quantity;
      }
    });

    order.payment = {
      cancelled: cancelledTotal,
      itemsTotal: itemsTotal,
      grandTotal: itemsTotal - cancelledTotal,
    };

    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    res.render("orderdetails", {
      user,
      order,
      orders,
      cartItems,
      cartCount,
    });
  } catch (error) {
    console.error("Error in viewOrderDetails:", error);
    res.redirect("/orders");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId }).populate(
      "orderedItem.Product"
    );
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!["pending", "confirmed"].includes(order.status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // Update each item in orderedItem to 'cancelled'
    for (let item of order.orderedItem) {
      if (["pending", "confirmed"].includes(item.status.toLowerCase())) {
        item.status = "cancelled";
        // Restore product quantity
        await Product.findByIdAndUpdate(item.Product, {
          $inc: { quantity: item.quantity },
        });
      }
    }

    // Re-evaluate order status based on items
    const activeItems = order.orderedItem.filter(
      (it) =>
        it.status.toLowerCase() !== "cancelled" &&
        it.status.toLowerCase() !== "return"
    );

    order.status = activeItems.length === 0 ? "cancelled" : order.status;
    order.updatedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling order",
    });
  }
};

const cancelItem = async (req, res) => {
  try {
    console.log(req.body);
    const { orderId, itemId, reason } = req.body;

    if (!orderId || !itemId || !reason) {
      console.error(
        `Invalid input: orderId=${orderId}, productId=${itemId}, reason=${reason}`
      );
      return res.status(400).json({
        success: false,
        message: "Order ID, Product ID, and reason are required",
      });
    }

    const order = await Order.findOne({ orderId }).populate(
      "orderedItem.Product"
    );
    if (!order) {
      console.error(`Order not found for orderId: ${orderId}`);
      return res.status(404).json({
        success: false,
        message: `Order not found for orderId: ${orderId}`,
      });
    }

    // if (!["pending",  'confirmed'].includes(order.orderedItem.status.toLowerCase())) {
    //     console.error(`Cannot cancel item, order status: ${order.status}`);
    //     return res.status(400).json({
    //         success: false,
    //         message: "Items cannot be cancelled at this stage",
    //     });
    // }

    const orderStatus = (order.status || "").toString().toLowerCase();
    if (!["pending", "confirmed"].includes(orderStatus)) {
      console.error(`Cannot cancel item, order status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: "Items cannot be cancelled at this stage",
      });
    }

    const item = order.orderedItem.id(itemId);
    if (!item) {
      console.error(
        `Item not found for productId: ${itemId} in order ${orderId}`
      );
      return res.status(404).json({
        success: false,
        message: `Item not found for productId: ${itemId} in this order`,
      });
    }

    if (item.status === "cancelled") {
      console.error(`Item already cancelled: ${itemId}`);
      return res.status(400).json({
        success: false,
        message: "Item is already cancelled",
      });
    }

    // In cancelItem function
if (order.couponApplied && order.appliedCoupon) {
  // Calculate remaining total
  let remainingTotal = 0;
  order.orderedItem.forEach(orderItem => {
    if (orderItem._id !== itemId && orderItem.status !== 'cancelled') {
      remainingTotal += orderItem.totalPrice;
    }
  });

  // Get coupon and validate
  const coupon = await Coupon.findOne({ name: order.appliedCoupon.code });
  if (coupon && remainingTotal < coupon.minimunPrice) {
    return res.status(400).json({
      success: false,
      message: "Cannot cancel - would violate coupon minimum"
    });
  }
}

    const product = await Product.findById(item.Product);
    if (!product) {
      console.error(`Product not found for ID: ${item.Product}`);
      return res.status(404).json({
        success: false,
        message: `Product not found for ID: ${item.Product}`,
      });
    }

    // Update item status and reason
    item.status = "cancelled";
    item.cancellationReason = reason;

    // Restore product quantity
    await Product.findByIdAndUpdate(item.Product, {
      $inc: { quantity: item.quantity },
    });
    console.log(`Restored ${item.quantity} units to product ${item.Product}`);

    // Re-evaluate order status based on items
    const activeItems = order.orderedItem.filter(
      (it) =>
        it.status.toLowerCase() !== "cancelled" &&
        it.status.toLowerCase() !== "return"
    );

    order.status = activeItems.length === 0 ? "cancelled" : order.status;

    await order.save();
    console.log(`Order ${orderId} saved successfully`);

    res.json({
      success: true,
      message: "Item cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling item:", error);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling item",
    });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    console.log(req.body, "------------------------");

    if (!orderId || !reason) {
      return res
        .status(400)
        .json({ success: false, message: "Missing orderId or reason" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "delivered") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only delivered orders can be returned",
        });
    }

    if (order.status === "returnrequest") {
      return res
        .status(400)
        .json({ success: false, message: "Return request already submitted" });
    }

    order.status = "returnrequest";
    order.orderedItem.forEach((item) => {
      if (item.status !== "cancelled" && item.status !== "returned") {
        item.returnReason = reason;
        item.status = "returnrequest";
      }
    });
    order.updatedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error in returnOrder:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const returnItem = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;

    if (!orderId || !itemId || !reason) {
      console.error(
        `Invalid input: orderId=${orderId}, itemId=${itemId}, reason=${reason}`
      );
      return res.status(400).json({
        success: false,
        message: "Order ID, Item ID, and reason are required",
      });
    }

    const order = await Order.findOne({ orderId }).populate(
      "orderedItem.Product"
    );
    if (!order) {
      console.error(`Order not found for orderId: ${orderId}`);
      return res.status(404).json({
        success: false,
        message: `Order not found for orderId: ${orderId}`,
      });
    }

    if (order.status !== "delivered") {
      console.error(`Cannot return item, order status: ${order.status}`);
      return res.status(400).json({
        success: false,
        message: "Items can only be returned for delivered orders",
      });
    }

    // Check for pending order-level return request
    if (order.status === "returnrequest") {
      console.error(
        `Item-level return blocked due to pending order-level return for order ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message:
          "Item-level returns are disabled due to a pending order-level return request.",
      });
    }

    const item = order.orderedItem.id(itemId);
    if (!item) {
      console.error(`Item not found for itemId: ${itemId} in order ${orderId}`);
      return res.status(404).json({
        success: false,
        message: `Item not found in this order`,
      });
    }

    if (item.status === "returnrequest" || item.status === "returned") {
      console.error(`Item already has a return status: ${item.status}`);
      return res.status(400).json({
        success: false,
        message: "Item already has a return request or is returned",
      });
    }

    item.status = "returnrequest";
    item.returnReason = reason;
    item.requestedAt = new Date();

    await order.save();
    console.log(`Return request saved for item ${itemId} in order ${orderId}`);

    res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error in returnItem:", error);
    res.status(500).json({
      success: false,
      message: "Server error while submitting return request",
    });
  }
};

// const loadwallet = async (req, res) => {
//   try {
//     const userId = req.session.user?._id || req.session.user;
//     console.log("User ID from session:", userId);

//     if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
//       console.log("Invalid userId, redirecting to login");
//       return res.redirect("/login?message=Please log in to view your wallet");
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       console.log("User not found, redirecting to login");
//       return res.redirect("/login?message=User not found");
//     }

//     if (user.isBlocked) {
//       console.log("User is blocked, destroying session");
//       req.session.destroy((err) => {
//         if (err) console.error("Error destroying session:", err);
//       });
//       return res.redirect(
//         "/login?message=Your account is blocked. Please contact support."
//       );
//     }

//     let wallet = await Wallet.findOne({ userId });
//     console.log("Wallet found:", wallet);

//     if (!wallet) {
//       console.log("No wallet found, creating new wallet");
//       wallet = new Wallet({ userId, balance: 0, transactions: [] });
//       await wallet.save();
//     }

//     // Helper to determine if an order was Cash On Delivery.
//     const isCOD = (paymentMethod) => {
//       if (!paymentMethod) return false;
//       const pm = String(paymentMethod).toLowerCase();
//       // Accept common variants: 'cash on delivery', 'cod', 'cashondelivery'
//       return (
//         (pm.includes("cash") && pm.includes("delivery")) ||
//         pm === "cod" ||
//         pm.includes("cod")
//       );
//     };

//     // Find orders where at least one item is cancelled or returned
//     const orders = await Order.find({
//       userId,
//       "orderedItem.status": { $in: ["cancelled", "returned"] },
//     }).populate("orderedItem.Product");

//     for (const order of orders) {
//       const orderIsCOD = isCOD(order.paymentMethod);
//       let orderModified = false;

//       for (const item of order.orderedItem) {
//         // Skip if already processed
//         if (item.refundProcessed) {
//           console.log(`Skipping item ${item._id} - refund already processed.`);
//           continue;
//         }

//         // const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
//         const itemTotal = Number(
//           item.totalPrice ??
//             (item.discountedPrice ?? item.price) * (item.quantity ?? 1)
//         );

//         if (itemTotal <= 0) continue;

//         if (String(item.status).toLowerCase() === "cancelled") {
//           if (orderIsCOD) {
//             console.log(
//               `Skipping refund for cancelled COD order ORD:${String(
//                 order.orderId
//               ).slice(-8)} item ${item._id}`
//             );
//             continue;
//           }

//           const refundDescription = `Refund for cancelled order ORD:${String(
//             order.orderId
//           ).slice(-8)} item:${item._id}`;
//           const existingTransaction = wallet.transactions.find(
//             (t) => t.description === refundDescription
//           );
//           if (!existingTransaction) {
//             wallet.transactions.unshift({
//               amount: itemTotal,
//               type: "credit",
//               date: new Date(),
//               description: refundDescription,
//             });
//             wallet.balance = Number(wallet.balance || 0) + itemTotal;
//             item.refundProcessed = true;
//             orderModified = true;
//             console.log(
//               `Adding refund transaction (cancel): ${refundDescription} amount ${itemTotal}`
//             );
//           } else {
//             // If wallet already has it but item.refundProcessed not set, set it now to avoid duplicate next time
//             item.refundProcessed = true;
//             orderModified = true;
//             console.log(
//               `Found existing wallet transaction for ${refundDescription}. Marking item refundProcessed.`
//             );
//           }
//         } else if (String(item.status).toLowerCase() === "returned") {
//           // For returned items we currently refund (you can decide to skip COD returns similarly)
//           const refundDescription = `Refund for returned order ORD:${String(
//             order.orderId
//           ).slice(-8)} item:${item._id}`;
//           const existingTransaction = wallet.transactions.find(
//             (t) => t.description === refundDescription
//           );
//           if (!existingTransaction) {
//             wallet.transactions.unshift({
//               amount: itemTotal,
//               type: "credit",
//               date: new Date(),
//               description: refundDescription,
//             });
//             wallet.balance = Number(wallet.balance || 0) + itemTotal;
//             item.refundProcessed = true;
//             orderModified = true;
//             console.log(
//               `Adding refund transaction (return): ${refundDescription} amount ${itemTotal}`
//             );
//           } else {
//             item.refundProcessed = true;
//             orderModified = true;
//           }
//         }
//       }

//       if (wallet.isModified()) {
//         await wallet.save();
//         console.log("Wallet updated with refunds:", wallet);
//       }

//       if (orderModified) {
//         await order.save();
//         console.log(
//           `Order ${order.orderId} updated with refundProcessed flags`
//         );
//       }
//     }

//     // for (const order of orders) {
//     //     const orderIsCOD = isCOD(order.paymentMethod);
//     //     let orderModified = false;

//     //     // Step 1: Calculate subtotal AFTER product offers are applied
//     //     // This is the base amount on which coupon will be applied
//     //     const subtotal = order.orderedItem.reduce((sum, item) => {
//     //         // Use discounted price if available, otherwise regular price
//     //         const effectivePrice = item.discountedPrice ?? item.price;
//     //         const itemTotal = effectivePrice * (item.quantity ?? 1);
//     //         return sum + itemTotal;
//     //     }, 0);

//     //     // Step 2: Calculate total coupon discount on the subtotal
//     //     let totalCouponDiscount = 0;
//     //     if (order.coupon && subtotal > 0) {
//     //         if (order.coupon.type === "percent") {
//     //             totalCouponDiscount = (subtotal * order.coupon.value) / 100;
//     //             // Apply max discount limit if exists
//     //             if (order.coupon.maxDiscount) {
//     //                 totalCouponDiscount = Math.min(totalCouponDiscount, order.coupon.maxDiscount);
//     //             }
//     //         } else if (order.coupon.type === "fixed") {
//     //             totalCouponDiscount = Math.min(order.coupon.value, subtotal);
//     //         }
//     //     }

//     //     console.log(`📦 Order ${order.orderId}:`);
//     //     console.log(`   Subtotal (after offers): ₹${subtotal}`);
//     //     console.log(`   Total Coupon Discount: ₹${totalCouponDiscount}`);
//     //     console.log(`   Final Order Amount: ₹${subtotal - totalCouponDiscount}`);

//     //     // Step 3: Process each item for refund
//     //     for (const item of order.orderedItem) {
//     //         // Skip if already processed
//     //         if (item.refundProcessed) {
//     //             console.log(`⏭️  Skipping item ${item._id} - already processed`);
//     //             continue;
//     //         }

//     //         // Only process cancelled or returned items
//     //         if (!["cancelled", "returned"].includes(item.status?.toLowerCase())) {
//     //             continue;
//     //         }

//     //         // Calculate item's amount after product offer
//     //         const effectivePrice = item.discountedPrice ?? item.price;
//     //         const itemSubtotal = effectivePrice * (item.quantity ?? 1);

//     //         // Calculate this item's proportional share of the coupon discount
//     //         const itemCouponShare = subtotal > 0
//     //             ? (itemSubtotal / subtotal) * totalCouponDiscount
//     //             : 0;

//     //         // Final refund amount = item amount after offers - proportional coupon discount
//     //         const refundAmount = Math.round((itemSubtotal - itemCouponShare) * 100) / 100;

//     //         console.log(`\n   Item ${item._id} (${item.status}):`);
//     //         console.log(`   - Original Price: ₹${item.price} × ${item.quantity}`);
//     //         console.log(`   - Discounted Price: ₹${effectivePrice} × ${item.quantity} = ₹${itemSubtotal}`);
//     //         console.log(`   - Coupon Share: ₹${itemCouponShare.toFixed(2)}`);
//     //         console.log(`   - Final Refund: ₹${refundAmount}`);

//     //         if (refundAmount <= 0) {
//     //             console.log(`   ⚠️  Refund amount is ₹0 or less, skipping`);
//     //             continue;
//     //         }

//     //         // Skip COD cancelled orders (no refund for COD cancellations)
//     //         if (orderIsCOD && item.status?.toLowerCase() === "cancelled") {
//     //             console.log(`   💵 Skipping COD cancelled order - no refund needed`);
//     //             item.refundProcessed = true;
//     //             orderModified = true;
//     //             continue;
//     //         }

//     //         // Create refund description
//     //         const refundDescription = `Refund for ${item.status} order ORD:${String(order.orderId).slice(-8)} item:${item._id}`;

//     //         // Check if refund already exists
//     //         const alreadyExists = wallet.transactions.some(
//     //             t => t.description === refundDescription
//     //         );

//     //         if (!alreadyExists) {
//     //             // Add refund transaction
//     //             wallet.transactions.unshift({
//     //                 amount: refundAmount,
//     //                 type: "credit",
//     //                 date: new Date(),
//     //                 description: refundDescription
//     //             });

//     //             wallet.balance = Number(wallet.balance || 0) + refundAmount;
//     //             item.refundProcessed = true;
//     //             orderModified = true;

//     //             console.log(`   ✅ Refund of ₹${refundAmount} added to wallet`);
//     //         } else {
//     //             // Mark as processed even if transaction exists
//     //             item.refundProcessed = true;
//     //             orderModified = true;
//     //             console.log(`   ℹ️  Transaction already exists, marked as processed`);
//     //         }
//     //     }

//     //     // Save changes
//     //     if (wallet.isModified()) {
//     //         await wallet.save();
//     //         console.log(`💾 Wallet saved`);
//     //     }

//     //     if (orderModified) {
//     //         await order.save();
//     //         console.log(`💾 Order ${order.orderId} saved with refundProcessed flags\n`);
//     //     }
//     // }

//     const walletData = {
//       userId: userId,
//       userName: user.name,
//       cardNumber: "•••• •••• •••• 1234",
//       balance: wallet.balance,
//       transactions: wallet.transactions.map((transaction, index) => ({
//         id: index + 1,
//         amount: transaction.amount,
//         type: transaction.type,
//         date: transaction.date,
//         description: transaction.description,
//       })),
//     };

//     console.log("Wallet data sent to template:", walletData);

//     let cartCount = 0;
//     if (req.session.user) {
//       const userCart = await Cart.findOne({ userId: req.session.user._id });
//       if (userCart && userCart.items) {
//         cartCount = userCart.items.length;
//       }
//     }

//     res.render("wallet", { walletData, user, cartCount });
//   } catch (error) {
//     console.error("Error in loadwallet:", error);
//     res.status(500).render("error", {
//       message: "Server error. Please try again.",
//       error: error.message,
//     });
//   }
// };


const loadwallet = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    console.log("User ID from session:", userId);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Invalid userId, redirecting to login");
      return res.redirect("/login?message=Please log in to view your wallet");
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found, redirecting to login");
      return res.redirect("/login?message=User not found");
    }

    if (user.isBlocked) {
      console.log("User is blocked, destroying session");
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.redirect(
        "/login?message=Your account is blocked. Please contact support."
      );
    }

    let wallet = await Wallet.findOne({ userId });
    console.log("Wallet found:", wallet);

    if (!wallet) {
      console.log("No wallet found, creating new wallet");
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
      await wallet.save();
    }

    // Helper to determine if an order was Cash On Delivery.
    const isCOD = (paymentMethod) => {
      if (!paymentMethod) return false;
      const pm = String(paymentMethod).toLowerCase();
      return (
        (pm.includes("cash") && pm.includes("delivery")) ||
        pm === "cod" ||
        pm.includes("cod")
      );
    };

    // Find orders where at least one item is cancelled or returned
    const orders = await Order.find({
      userId,
      "orderedItem.status": { $in: ["cancelled", "returned"] },
    }).populate("orderedItem.Product");

    for (const order of orders) {
      const orderIsCOD = isCOD(order.paymentMethod);
      let orderModified = false;

      // ✅ Calculate the subtotal (sum of all items' totalPrice - which has offer discounts applied)
      const subtotal = order.orderedItem.reduce((sum, item) => {
        const itemTotal = Number(item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1));
        return sum + itemTotal;
      }, 0);

      // ✅ Get the total coupon discount from the order
      const totalCouponDiscount = Number(order.couponDiscount || 0);

      console.log(`\n📦 Processing Order ${order.orderId}:`);
      console.log(`   Subtotal (after offer discounts): ₹${subtotal}`);
      console.log(`   Total Coupon Discount: ₹${totalCouponDiscount}`);

      for (const item of order.orderedItem) {
        // Skip if already processed
        if (item.refundProcessed) {
          console.log(`⏭️  Skipping item ${item._id} - refund already processed.`);
          continue;
        }

        // Only process cancelled or returned items
        const itemStatus = String(item.status).toLowerCase();
        if (!["cancelled", "returned"].includes(itemStatus)) {
          continue;
        }

        // ✅ Item's total price after offer discount (but before coupon)
        const itemTotalAfterOffer = Number(
          item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1)
        );

        if (itemTotalAfterOffer <= 0) {
          console.log(`   ⚠️  Item ${item._id} has invalid total, skipping`);
          continue;
        }

        // ✅ Calculate this item's proportional share of the coupon discount
        let itemCouponShare = 0;
        if (totalCouponDiscount > 0 && subtotal > 0) {
          itemCouponShare = (itemTotalAfterOffer / subtotal) * totalCouponDiscount;
        }

        // ✅ REFUND AMOUNT = Item total after offer - Item's coupon share
        // This ensures we refund only what the customer actually paid
        const refundAmount = Math.round((itemTotalAfterOffer - itemCouponShare) * 100) / 100;

        console.log(`\n   Item ${item._id} (${itemStatus}):`);
        console.log(`   - Original Price: ₹${item.price} × ${item.quantity}`);
        console.log(`   - After Offer Discount: ₹${itemTotalAfterOffer}`);
        console.log(`   - Coupon Share: ₹${itemCouponShare.toFixed(2)}`);
        console.log(`   - Refund Amount: ₹${refundAmount}`);

        if (refundAmount <= 0) {
          console.log(`   ⚠️  Refund amount is ₹0 or less, marking as processed but no refund`);
          item.refundProcessed = true;
          orderModified = true;
          continue;
        }

        // Skip COD cancelled orders (no refund for COD cancellations)
        if (orderIsCOD && itemStatus === "cancelled") {
          console.log(`   💵 Skipping COD cancelled order - no refund needed`);
          item.refundProcessed = true;
          orderModified = true;
          continue;
        }

        // Create refund description
        const refundDescription = `Refund for ${itemStatus} order ORD:${String(order.orderId).slice(-8)} item:${item._id}`;

        // Check if refund already exists in wallet
        const existingTransaction = wallet.transactions.find(
          (t) => t.description === refundDescription
        );

        if (!existingTransaction) {
          // ✅ Add refund transaction with correct amount
          wallet.transactions.unshift({
            amount: refundAmount,
            type: "credit",
            date: new Date(),
            description: refundDescription,
          });

          wallet.balance = Number(wallet.balance || 0) + refundAmount;
          item.refundProcessed = true;
          orderModified = true;

          console.log(`   ✅ Refund of ₹${refundAmount} added to wallet`);
        } else {
          // Mark as processed even if transaction exists
          item.refundProcessed = true;
          orderModified = true;
          console.log(`   ℹ️  Transaction already exists in wallet, marked as processed`);
        }
      }

      // Save changes
      if (wallet.isModified()) {
        await wallet.save();
        console.log(`💾 Wallet saved with new balance: ₹${wallet.balance}`);
      }

      if (orderModified) {
        await order.save();
        console.log(`💾 Order ${order.orderId} updated with refundProcessed flags\n`);
      }
    }

    const walletData = {
      userId: userId,
      userName: user.name,
      cardNumber: "•••• •••• •••• 1234",
      balance: wallet.balance,
      transactions: wallet.transactions.map((transaction, index) => ({
        id: index + 1,
        amount: transaction.amount,
        type: transaction.type,
        date: transaction.date,
        description: transaction.description,
      })),
    };

    console.log("Wallet data sent to template:", walletData);

    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length;
      }
    }

    res.render("wallet", { walletData, user, cartCount });
  } catch (error) {
    console.error("Error in loadwallet:", error);
    res.status(500).json({ message: "Server error" })
  }
};

const refreshWallet = async (req, res) => {
  try {
    console.log("Refresh wallet requested");
    res.status(200).json({ message: "Wallet refresh triggered" });
  } catch (error) {
    console.error("Error refreshing wallet:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to download invoice" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res
        .status(403)
        .json({ success: false, message: "Your account is blocked" });
    }

    const { orderId } = req.query;
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const order = await Order.findOne({ orderId, userId }).populate(
      "orderedItem.Product"
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Log order details to debug
    console.log("Order details:", {
      orderId: order.orderId,
      totalPrice: order.totalPrice,
      discount: order.discount,
      finalAmount: order.finalAmount,
    });

    // Validate required fields
    if (
      order.totalPrice == null ||
      order.discount == null ||
      order.finalAmount == null
    ) {
      console.error("Missing or invalid order fields:", {
        totalPrice: order.totalPrice,
        discount: order.discount,
        finalAmount: order.finalAmount,
      });
      return res.status(500).json({
        success: false,
        message: "Invalid order data. Please contact support.",
      });
    }

    // Create a new PDF document
    const doc = new PDFDocument({ margin: 50 });
    const filename = `Invoice_${orderId}.pdf`;

    // Set response headers to trigger download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Add content to the PDF
    // Header
    doc.fontSize(20).text("INVOICE", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${order.orderId}`, { align: "right" });
    doc.text(
      `Invoice Date: ${new Date(
        order.invoiceDate || Date.now()
      ).toLocaleDateString("en-IN")}`,
      { align: "right" }
    );
    doc.moveDown();

    // Company Info
    doc.fontSize(14).text("From:", { underline: true });
    doc.fontSize(12).text("TimeLuxe");
    doc.text("123 Business Street, Commerce City");
    doc.text("India, 9496218956");
    doc.text("Email: support@timeluxe.com");
    doc.moveDown();

    // Customer Info
    doc.fontSize(14).text("To:", { underline: true });
    doc.fontSize(12).text(order.address.name || "N/A");
    doc.text(
      `${order.address.addressType || ""}${
        order.address.landmark ? ", " + order.address.landmark : ""
      }`
    );
    doc.text(`${order.address.city || ""} - ${order.address.pincode || ""}`);
    doc.text(order.address.state || "");
    doc.text(`Phone: ${order.address.phone || "N/A"}`);
    doc.moveDown();

    // Order Details Table
    doc.fontSize(14).text("Order Details:", { underline: true });
    doc.moveDown();

    // Table Headers
    const tableTop = doc.y;
    const itemX = 50;
    const qtyX = 250;
    const priceX = 350;
    const totalX = 450;

    doc.fontSize(12).font("Helvetica-Bold");
    doc.text("Item", itemX, tableTop);
    doc.text("Quantity", qtyX, tableTop);
    doc.text("Price", priceX, tableTop);
    doc.text("Total", totalX, tableTop);
    doc.moveDown(0.5);

    // Table Rows
    doc.font("Helvetica");
    let currentY = doc.y;
    order.orderedItem.forEach((item) => {
      const productName = item.Product?.productName || "Unknown Product";
      doc.text(productName, itemX, currentY, { width: 180 });
      doc.text(item.quantity.toString(), qtyX, currentY);
      doc.text(
        `RS ${Number(item.price).toLocaleString("en-IN")}`,
        priceX,
        currentY
      );
      doc.text(
        `RS ${Number(item.price * item.quantity).toLocaleString("en-IN")}`,
        totalX,
        currentY
      );
      currentY += 20;
    });

    // Draw table lines
    doc.strokeColor("#000000").lineWidth(1);
    doc
      .moveTo(itemX, tableTop - 5)
      .lineTo(totalX + 100, tableTop - 5)
      .stroke();
    doc
      .moveTo(itemX, currentY)
      .lineTo(totalX + 100, currentY)
      .stroke();
    doc
      .moveTo(itemX, tableTop - 5)
      .lineTo(itemX, currentY)
      .stroke();
    doc
      .moveTo(totalX + 100, tableTop - 5)
      .lineTo(totalX + 100, currentY)
      .stroke();

    doc.moveDown();

    // Payment Summary
    doc.fontSize(14).text("Payment Summary:", { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(
      `Items Total: RS ${Number(order.totalPrice).toLocaleString("en-IN")}`,
      { align: "right" }
    );
    doc.text(`Discount: RS ${Number(order.discount).toLocaleString("en-IN")}`, {
      align: "right",
    });
    doc.text(
      `Final Amount: RS ${Number(order.finalAmount).toLocaleString("en-IN")}`,
      { align: "right" }
    );
    doc.moveDown();

    // Footer
    doc
      .fontSize(10)
      .text("Thank you for shopping with Timeluxe!", { align: "center" });
    doc.text("For any queries, contact us at support@timeluxe.com", {
      align: "center",
    });

    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while generating invoice",
      });
  }
};

module.exports = {
  ordersuccesspage,
  orderfailurepage,
  createOrder,
  loadorder,
  viewOrderDetails,
  cancelOrder,
  cancelItem,
  returnOrder,
  returnItem,
  loadwallet,
  refreshWallet,
  verifyRazorpay,
  downloadInvoice,
};
