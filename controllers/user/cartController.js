const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const Wishlist = require("../../models/wishlistSchema");

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const loadcart = async (req, res) => {
  try {
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; 
      }
    }
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect("/pageNotFound");
    }

    const cartData = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isBlocked: false, isListed: true },
      populate: [{ path: "category" }, { path: "brand" }],
    });

    if (cartData) {
      const validItems = cartData.items.filter((item) => item.productId);
      if (validItems.length !== cartData.items.length) {
        cartData.items = validItems;
        await cartData.save();
      }
    }
    const cartItems = cartData ? cartData.items || [] : [];

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
        {
          "productItem.endDate": null,
          "productItem.startDate": { $lte: currentDate },
        },
        {
          "categoryItem.endDate": null,
          "categoryItem.startDate": { $lte: currentDate },
        },
      ],
    });

    // Process offers for each cart item
    let offerDiscount = 0;
    let hasOfferProducts = false;

    cartItems.forEach((item) => {
      let applicableOffer = null;
      let maxDiscount = 0;
      let discountedPrice = item.price;

      // Check for product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((productItem) => {
          if (
            productItem.product.toString() === item.productId._id.toString() &&
            new Date(productItem.startDate) <= currentDate &&
            (productItem.endDate === null ||
              new Date(productItem.endDate) > currentDate)
          ) {
            if (productItem.discount > maxDiscount) {
              maxDiscount = productItem.discount;
              applicableOffer = {
                discount: productItem.discount,
                offerName: productItem.offerName,
                type: "Product Offer",
              };
              discountedPrice = item.price * (1 - productItem.discount / 100);
            }
          }
        });
      });

      // Check for category-specific offer
      offers.forEach((offer) => {
        offer.categoryItem.forEach((categoryItem) => {
          if (
            categoryItem.category.toString() ===
              item.productId.category._id.toString() &&
            new Date(categoryItem.startDate) <= currentDate &&
            (categoryItem.endDate === null ||
              new Date(categoryItem.endDate) > currentDate)
          ) {
            if (categoryItem.discount > maxDiscount) {
              maxDiscount = categoryItem.discount;
              applicableOffer = {
                discount: categoryItem.discount,
                offerName: categoryItem.offerName,
                type: "Category Offer",
              };
              discountedPrice = item.price * (1 - categoryItem.discount / 100);
            }
          }
        });
      });

      // Apply offer discount
      if (applicableOffer) {
        item.offer = applicableOffer;
        hasOfferProducts = true;
        item.discountedPrice = Math.round(discountedPrice * 100) / 100;
        const itemOfferDiscount =
          (item.price - item.discountedPrice) * item.quantity;
        offerDiscount += itemOfferDiscount;
        item.totalPrice = item.discountedPrice * item.quantity;
      } else {
        item.offer = null;
        item.discountedPrice = item.price;
        item.totalPrice = item.price * item.quantity;
      }
    });

    // Calculate total price before coupon
    let totalPrice = cartItems.reduce(
      (sum, item) => sum + (item.totalPrice || 0),
      0
    );

    // Fetch available coupons
    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gte: new Date() },
      minimunPrice: { $lte: totalPrice },
    }).lean();

    // Apply coupon discount if any
    let couponDiscount = 0;
    let appliedCoupon = null;

    if (hasOfferProducts) {
      // Remove coupon from session if offer products exist
      req.session.appliedCoupon = null;
    } else if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        name: req.session.appliedCoupon.name,
        isList: true,
        expireOn: { $gte: new Date() },
        minimunPrice: { $lte: totalPrice },
      });
      if (coupon) {
        couponDiscount = coupon.offerPrice;
        appliedCoupon = {
          name: coupon.name,
          discount: coupon.offerPrice,
          expiryDate: coupon.expireOn,
          minPurchase: coupon.minimunPrice,
        };

        // Distribute coupon discount proportionally
        const totalItemsPrice = cartItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0
        );
        cartItems.forEach((item) => {
          const itemContribution = item.totalPrice / totalItemsPrice;
          const itemCouponDiscount = couponDiscount * itemContribution;
          item.couponDiscount = itemCouponDiscount;
          item.discountedPrice = item.discountedPrice - itemCouponDiscount;
          item.totalPrice = item.discountedPrice * item.quantity;
        });

        await cartData.save();
      } else {
        req.session.appliedCoupon = null;
      }
    }

    // Recalculate total price after coupon discount
    const originalTotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const offerTotal = originalTotal - offerDiscount;

    const couponTotal = originalTotal - couponDiscount;

    res.render("cart", {
      user: userData,
      cartItems: cartItems,
      originalTotal: originalTotal,
      totalPrice: totalPrice,
      coupons,
      couponDiscount: couponDiscount,
      offerDiscount: offerDiscount,
      couponTotal: couponTotal,
      offerTotal: offerTotal,
      appliedCoupon: appliedCoupon,
      cartCount,
      hasOfferProducts: hasOfferProducts,
    });
  } catch (error) {
    console.error("Error loading cart:", error);
    res.redirect("/pageNotFound");
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to add to cart" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.quantity === undefined || product.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "This product is currently out of stock",
      });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`,
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const productIdStr = productId.toString();
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId && item.productId.toString() === productIdStr
    );

    let isNewProduct = false;

    if (existingItemIndex !== -1) {
      const newQuantity =
        cart.items[existingItemIndex].quantity + parseInt(quantity);
      if (newQuantity > product.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.quantity} items available in stock`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].totalPrice =
        cart.items[existingItemIndex].quantity *
        cart.items[existingItemIndex].price;
    } else {
      isNewProduct = true;
      cart.items.push({
        productId,
        quantity: parseInt(quantity),
        price: product.salePrice,
        totalPrice: product.salePrice * parseInt(quantity),
        status: "pending",
        cancellationReason: "none",
      });
    }

    await cart.save();
    console.log("Cart saved successfully");

    try {
      await Wishlist.updateOne(
        { userId },
        { $pull: { Product: { productId } } }
      );
      console.log(
        `Product ${productId} removed from wishlist for user ${userId}`
      );
    } catch (wishlistError) {
      console.error("Error removing product from wishlist:", wishlistError);
    }

    // Calculate updated cart count (number of unique products)
    const updatedCart = await Cart.findOne({ userId });
    const cartCount = updatedCart ? updatedCart.items.length : 0;

    res.status(200).json({ success: true, message: "Product added to cart" });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while adding to cart",
      error: error.message,
    });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to remove from cart" });
    }

    await Cart.updateOne({ userId }, { $pull: { items: { productId } } });

    res
      .status(200)
      .json({ success: true, message: "Product removed from cart" });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

const updateCart = async (req, res) => {
  try {
    const { productId, change } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to update cart",
      });
    }

    // Find cart with populated product data
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isBlocked: false, isListed: true },
      populate: [{ path: "category" }, { path: "brand" }],
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Find the item in cart
    const itemIndex = cart.items.findIndex(
      (item) => item.productId && item.productId._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    const item = cart.items[itemIndex];
    const product = item.productId;

    // Calculate new quantity
    const newQuantity = item.quantity + change;

    // Validate quantity
    if (newQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity cannot be less than 1",
      });
    }

    if (newQuantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`,
      });
    }

    if (newQuantity > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum 10 items allowed per product",
      });
    }

    // Update quantity
    item.quantity = newQuantity;

    // Recalculate offers for all items
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
        {
          "productItem.endDate": null,
          "productItem.startDate": { $lte: currentDate },
        },
        {
          "categoryItem.endDate": null,
          "categoryItem.startDate": { $lte: currentDate },
        },
      ],
    });

    let totalOfferDiscount = 0;
    let hasOfferProducts = false;

    // Process offers for all items
    cart.items.forEach((cartItem) => {
      if (!cartItem.productId) return;

      let applicableOffer = null;
      let maxDiscount = 0;
      let discountedPrice = cartItem.price;

      // Check for product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((productItem) => {
          if (
            productItem.product.toString() ===
              cartItem.productId._id.toString() &&
            new Date(productItem.startDate) <= currentDate &&
            (productItem.endDate === null ||
              new Date(productItem.endDate) > currentDate)
          ) {
            if (productItem.discount > maxDiscount) {
              maxDiscount = productItem.discount;
              applicableOffer = {
                discount: productItem.discount,
                offerName: productItem.offerName,
                type: "Product Offer",
              };
              discountedPrice =
                cartItem.price * (1 - productItem.discount / 100);
            }
          }
        });
      });

      // Check for category-specific offer
      offers.forEach((offer) => {
        offer.categoryItem.forEach((categoryItem) => {
          if (
            categoryItem.category.toString() ===
              cartItem.productId.category._id.toString() &&
            new Date(categoryItem.startDate) <= currentDate &&
            (categoryItem.endDate === null ||
              new Date(categoryItem.endDate) > currentDate)
          ) {
            if (categoryItem.discount > maxDiscount) {
              maxDiscount = categoryItem.discount;
              applicableOffer = {
                discount: categoryItem.discount,
                offerName: categoryItem.offerName,
                type: "Category Offer",
              };
              discountedPrice =
                cartItem.price * (1 - categoryItem.discount / 100);
            }
          }
        });
      });

      // Apply offer
      if (applicableOffer) {
        hasOfferProducts = true;
        cartItem.offer = applicableOffer;
        cartItem.discountedPrice = Math.round(discountedPrice * 100) / 100;
        const itemOfferDiscount =
          (cartItem.price - cartItem.discountedPrice) * cartItem.quantity;
        totalOfferDiscount += itemOfferDiscount;
      } else {
        cartItem.offer = null;
        cartItem.discountedPrice = cartItem.price;
      }

      cartItem.totalPrice = cartItem.discountedPrice * cartItem.quantity;
    });

    // Save cart
    await cart.save();

    const price = item.productId.price * item.quantity;

    // Calculate totals
    const originalTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const totalAfterOffers = originalTotal - totalOfferDiscount;

    // Get coupon discount if applied
    let couponDiscount = 0;
    // if (req.session.appliedCoupon) {
    //       const coupon = await Coupon.findOne({
    //     name: req.session.appliedCoupon.name,
    //     isList: true,
    //     expireOn: { $gte: new Date() },
    //     minimunPrice: { $lte: totalAfterOffers },
    //   });

    if (hasOfferProducts) {
      req.session.appliedCoupon = null;
    } else if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        name: req.session.appliedCoupon.name,
        isList: true,
        expireOn: { $gte: new Date() },
        minimunPrice: { $lte: totalAfterOffers },
      });

      if (coupon) {
        couponDiscount = coupon.offerPrice;
      } else {
        // Remove invalid coupon from session
        req.session.appliedCoupon = null;
      }
    }

    const finalTotal = totalAfterOffers - couponDiscount;

    // Get updated item total
    const updatedItem = cart.items[itemIndex];

    return res.json({
      success: true,
      message: "Quantity updated successfully",
      newQuantity: updatedItem.quantity,
      itemTotal: updatedItem.totalPrice,
      cartTotals: {
        originalTotal: originalTotal,
        offerDiscount: totalOfferDiscount,
        couponDiscount: couponDiscount,
        finalTotal: finalTotal,
      },
      hasOfferProducts: hasOfferProducts,
    });
  } catch (error) {
    console.error("Error updating cart quantity:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating quantity",
    });
  }
};

const loadcheckout = async (req, res) => {
  try {
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect("/pageNotFound");
    }

    const cartData = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: [{ path: "category" }, { path: "brand" }],
    });

    const cartItems = cartData ? cartData.items || [] : [];

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
        {
          "productItem.endDate": null,
          "productItem.startDate": { $lte: currentDate },
        },
        {
          "categoryItem.endDate": null,
          "categoryItem.startDate": { $lte: currentDate },
        },
      ],
    });

    // Process offers for each cart item
    let offerDiscount = 0;
    let hasOfferProducts = false;
    cartItems.forEach((item) => {
      let applicableOffer = null;
      let maxDiscount = 0;
      let discountedPrice = item.price;

      // Check for product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((productItem) => {
          if (
            productItem.product.toString() === item.productId._id.toString() &&
            new Date(productItem.startDate) <= currentDate &&
            (productItem.endDate === null ||
              new Date(productItem.endDate) > currentDate)
          ) {
            if (productItem.discount > maxDiscount) {
              maxDiscount = productItem.discount;
              applicableOffer = {
                discount: productItem.discount,
                offerName: productItem.offerName,
                type: "Product Offer",
              };
              discountedPrice = item.price * (1 - productItem.discount / 100);
            }
          }
        });
      });

      // Check for category-specific offer
      offers.forEach((offer) => {
        offer.categoryItem.forEach((categoryItem) => {
          if (
            categoryItem.category.toString() ===
              item.productId.category._id.toString() &&
            new Date(categoryItem.startDate) <= currentDate &&
            (categoryItem.endDate === null ||
              new Date(categoryItem.endDate) > currentDate)
          ) {
            if (categoryItem.discount > maxDiscount) {
              maxDiscount = categoryItem.discount;
              applicableOffer = {
                discount: categoryItem.discount,
                offerName: categoryItem.offerName,
                type: "Category Offer",
              };
              discountedPrice = item.price * (1 - categoryItem.discount / 100);
            }
          }
        });
      });

      // Apply offer discount
      if (applicableOffer) {
        hasOfferProducts = true;
        item.offer = applicableOffer;
        item.discountedPrice = Math.round(discountedPrice * 100) / 100;
        const itemOfferDiscount =
          (item.price - item.discountedPrice) * item.quantity;
        offerDiscount += itemOfferDiscount;
        item.totalPrice = item.discountedPrice * item.quantity;
      } else {
        item.offer = null;
        item.discountedPrice = item.price;
        item.totalPrice = item.price * item.quantity;
      }
    });

    // Calculate total price before coupon
    let totalPrice = cartItems.reduce(
      (sum, item) => sum + (item.totalPrice || 0),
      0
    );

    // Fetch available coupons
    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gte: new Date() },
      minimunPrice: { $lte: totalPrice },
    }).lean();

    // Apply coupon discount if any
    let couponDiscount = 0;
    let appliedCoupon = null;
    // if (req.session.appliedCoupon) {
    //   const coupon = await Coupon.findOne({
    //     name: req.session.appliedCoupon.name,
    //     isList: true,
    //     expireOn: { $gte: new Date() },
    //     minimunPrice: { $lte: totalPrice },
    //   });
    if (hasOfferProducts) {
      req.session.appliedCoupon = null;
    } else if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        name: req.session.appliedCoupon.name,
        isList: true,
        expireOn: { $gte: new Date() },
        minimunPrice: { $lte: totalPrice },
      });
      if (coupon) {
        couponDiscount = coupon.offerPrice;
        appliedCoupon = {
          name: coupon.name,
          discount: coupon.offerPrice,
          expiryDate: coupon.expireOn,
          minPurchase: coupon.minimunPrice,
        };

        // Distribute coupon discount proportionally
        const totalItemsPrice = cartItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0
        );
        cartItems.forEach((item) => {
          const itemContribution = item.totalPrice / totalItemsPrice;
          const itemCouponDiscount = couponDiscount * itemContribution;
          item.couponDiscount = itemCouponDiscount;
          item.discountedPrice = item.discountedPrice - itemCouponDiscount;
          item.totalPrice = item.discountedPrice * item.quantity;
        });

        await cartData.save();
      } else {
        req.session.appliedCoupon = null;
      }
    }

    // Recalculate total price after coupon discount
    const originalTotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const finalTotal = originalTotal - offerDiscount - couponDiscount;

    let addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    res.render("checkout", {
      user: userData,
      cartItems,
      totalPrice: totalPrice.toLocaleString("en-IN"),
      addresses,
      offerDiscount: offerDiscount.toLocaleString("en-IN"),
      couponDiscount: couponDiscount.toLocaleString("en-IN"),
      cartCount,
      coupons,
      originalTotal: originalTotal,
      finalTotal: finalTotal,
      hasOfferProducts: hasOfferProducts,
    });
  } catch (error) {
    console.error("Error loading checkout:", error);
    res.redirect("/pageNotFound");
  }
};

const loadpayment = async (req, res) => {
  try {
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    const userId = req.session.user?._id || req.session.user;
    if (!userId || !ObjectId.isValid(userId)) {
      console.error("Invalid or missing user ID in session:", userId);
      return res.redirect("/login?returnUrl=/payment");
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error(`User not found for ID: ${userId}`);
      return res.redirect("/login?returnUrl=/payment");
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

    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    if (
      user.selectedAddress &&
      !addresses.some(
        (addr) => addr._id.toString() === user.selectedAddress.toString()
      )
    ) {
      console.warn(
        `Invalid selectedAddress ${user.selectedAddress} for user ${userId}, resetting`
      );
      user.selectedAddress = null;
      await user.save();
    }

    let selectedAddress = null;
    if (user.selectedAddress) {
      selectedAddress = addresses.find(
        (addr) => addr._id.toString() === user.selectedAddress.toString()
      );
    }
    if (!selectedAddress && addresses.length > 0) {
      console.warn(
        `No selected address found for user ${userId}, defaulting to first address`
      );
      user.selectedAddress = addresses[0]._id;
      selectedAddress = addresses[0];
      await user.save();
    } else if (!selectedAddress) {
      console.error(`No addresses available for user ${userId}`);
      return res.redirect("/checkout?message=Please add an address");
    }

    const cartData = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isBlocked: false, isListed: true },
      populate: [{ path: "category" }, { path: "brand" }],
    });

    const cartItems =
      cartData && cartData.items
        ? cartData.items.filter((item) => item.productId)
        : [];

    if (cartItems.length === 0) {
      console.warn(`No items in cart for user ${userId}`);
      return res.redirect("/cart?message=Your cart is empty");
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
        {
          "productItem.endDate": null,
          "productItem.startDate": { $lte: currentDate },
        },
        {
          "categoryItem.endDate": null,
          "categoryItem.startDate": { $lte: currentDate },
        },
      ],
    });

    // Process offers for each cart item
    let offerDiscount = 0;
    cartItems.forEach((item) => {
      let applicableOffer = null;
      let maxDiscount = 0;
      let discountedPrice = item.price;

      // Check for product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((productItem) => {
          if (
            productItem.product.toString() === item.productId._id.toString() &&
            new Date(productItem.startDate) <= currentDate &&
            (productItem.endDate === null ||
              new Date(productItem.endDate) > currentDate)
          ) {
            if (productItem.discount > maxDiscount) {
              maxDiscount = productItem.discount;
              applicableOffer = {
                discount: productItem.discount,
                offerName: productItem.offerName,
                type: "Product Offer",
              };
              discountedPrice = item.price * (1 - productItem.discount / 100);
            }
          }
        });
      });

      // Check for category-specific offer
      offers.forEach((offer) => {
        offer.categoryItem.forEach((categoryItem) => {
          if (
            categoryItem.category.toString() ===
              item.productId.category._id.toString() &&
            new Date(categoryItem.startDate) <= currentDate &&
            (categoryItem.endDate === null ||
              new Date(categoryItem.endDate) > currentDate)
          ) {
            if (categoryItem.discount > maxDiscount) {
              maxDiscount = categoryItem.discount;
              applicableOffer = {
                discount: categoryItem.discount,
                offerName: categoryItem.offerName,
                type: "Category Offer",
              };
              discountedPrice = item.price * (1 - categoryItem.discount / 100);
            }
          }
        });
      });

      // Apply offer discount
      if (applicableOffer) {
        item.offer = applicableOffer;
        item.discountedPrice = Math.round(discountedPrice * 100) / 100;
        const itemOfferDiscount =
          (item.price - item.discountedPrice) * item.quantity;
        offerDiscount += itemOfferDiscount;
        item.totalPrice = item.discountedPrice * item.quantity;
      } else {
        item.offer = null;
        item.discountedPrice = item.price;
        item.totalPrice = item.price * item.quantity;
      }
    });

    // Calculate total price before coupon
    let totalPrice = cartItems.reduce(
      (sum, item) => sum + (item.totalPrice || 0),
      0
    );

    // Fetch available coupons
    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gte: new Date() },
      minimunPrice: { $lte: totalPrice },
    }).lean();

    // Apply coupon discount if any
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        name: req.session.appliedCoupon.name,
        isList: true,
        expireOn: { $gte: new Date() },
        minimunPrice: { $lte: totalPrice },
      });
      if (coupon) {
        couponDiscount = coupon.offerPrice;
        appliedCoupon = {
          name: coupon.name,
          discount: coupon.offerPrice,
          expiryDate: coupon.expireOn,
          minPurchase: coupon.minimunPrice,
        };

        // Distribute coupon discount proportionally
        const totalItemsPrice = cartItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0
        );
        cartItems.forEach((item) => {
          const itemContribution = item.totalPrice / totalItemsPrice;
          const itemCouponDiscount = couponDiscount * itemContribution;
          item.couponDiscount = itemCouponDiscount;
          item.discountedPrice = item.discountedPrice - itemCouponDiscount;
          item.totalPrice = item.discountedPrice * item.quantity;
        });

        await cartData.save();
      } else {
        req.session.appliedCoupon = null;
      }
    }

    // Recalculate total price after coupon discount
    const originalTotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const finalTotal = originalTotal - offerDiscount - couponDiscount;

    req.session.order = {
      ...req.session.order,
      selectedAddress,
      totalPrice,
      couponDiscount,
      appliedCoupon,
    };

    res.render("payment", {
      user,
      addresses,
      selectedAddress,
      cartItems,
      totalPrice,
      offerDiscount: offerDiscount.toLocaleString("en-IN"),
      couponDiscount,
      appliedCoupon,
      finalTotal,
      cartCount,
    });
  } catch (error) {
    console.error("Error rendering payment page:", error);
    res.redirect("/pageNotFound");
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please log in to apply coupon" });
    }

    if (req.session.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message:
          "A coupon is already applied. Please remove it to apply a new one.",
      });
    }

    const coupon = await Coupon.findOne({
      name: couponCode,
      isList: true,
      expireOn: { $gte: new Date() },
      userId: { $nin: [userId] },
    });

    if (!coupon) {
      const usedCoupon = await Coupon.findOne({
        name: couponCode,
        userId: { $in: [userId] },
      });

      if (usedCoupon) {
        return res.status(400).json({
          success: false,
          message: "You have already used this coupon code",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid or expired coupon",
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isBlocked: false, isListed: true },
      select: "salePrice category",
      populate: { path: "category", select: "_id" },
    });

    if (!cart || !cart.items.length) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const totalPrice = cart.items.reduce((total, item) => {
      const itemTotal = (item.discountedPrice || item.price) * item.quantity;
      return total + itemTotal;
    }, 0);

    if (totalPrice < coupon.minimunPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minimunPrice.toLocaleString(
          "en-IN"
        )} required for this coupon`,
      });
    }

    req.session.appliedCoupon = {
      name: coupon.name,
      code: coupon.name,
      discount: coupon.offerPrice,
      expiryDate: coupon.expireOn,
      minPurchase: coupon.minimunPrice,
    };

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      discount: coupon.offerPrice,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while applying the coupon",
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to remove coupon",
      });
    }

    if (!req.session.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message: "No coupon is currently applied",
      });
    }
    req.session.appliedCoupon = null;

    res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while removing the coupon",
    });
  }
};

module.exports = {
  loadcart,
  removeFromCart,
  addToCart,
  updateCart,
  loadcheckout,
  loadpayment,
  applyCoupon,
  removeCoupon,
};
