const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");
const Brand = require("../../models/brandSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Offer = require('../../models/offerSchema')

const loadwishlist = async (req, res) => {
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

    const wishlistData = await Wishlist.findOne({ userId }).populate({
      path: "Product.productId",
      populate: [{ path: "category" }, { path: "brand" }],
    });

   // Fetch active product-specific and category-specific offers
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

        const rawItems = wishlistData ? wishlistData.Product.filter(i => i.productId) : [];

        const productsWithOffers = rawItems.map(({ productId: product }) => {
            let applicableOffer = null;
            let maxDiscount = 0;
            let discountedPrice = product.salePrice;

            offers.forEach(offer => {
                // Product-specific offer
                offer.productItem.forEach(pi => {
                    if (
                        pi.product.toString() === product._id.toString() &&
                        new Date(pi.startDate) <= currentDate &&
                        new Date(pi.endDate) > currentDate &&
                        pi.discount > maxDiscount
                    ) {
                        maxDiscount = pi.discount;
                        applicableOffer = { discount: pi.discount, offerName: pi.offerName, type: "Product Offer" };
                        discountedPrice = product.salePrice * (1 - pi.discount / 100);
                    }
                });

                // Category-specific offer
                offer.categoryItem.forEach(ci => {
                    if (
                        ci.category.toString() === product.category?._id.toString() &&
                        new Date(ci.startDate) <= currentDate &&
                        new Date(ci.endDate) > currentDate &&
                        ci.discount > maxDiscount
                    ) {
                        maxDiscount = ci.discount;
                        applicableOffer = { discount: ci.discount, offerName: ci.offerName, type: "Category Offer" };
                        discountedPrice = product.salePrice * (1 - ci.discount / 100);
                    }
                });
            });

            return {
                ...product.toObject(),
                offer: applicableOffer,
                discountedPrice: Math.round(discountedPrice * 100) / 100,
            };
        });

        const cart = await Cart.findOne({ userId });
        const cartProductIds = cart
            ? cart.items.map((item) => item.productId.toString())
            : [];

    

    res.render("wishlist", {
      user: userData,
      wishlist: productsWithOffers,
      cartProductIds,
      cartCount,
    });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.status(500).render("error", {
      message: "Error loading wishlist",
      error: { status: 500, stack: error.stack },
    });
  }
};

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ status: false, message: "Please log in to view wishlist" });
    }

    const wishlist = await Wishlist.findOne({ userId });
    const productIds = wishlist
      ? wishlist.Product.map((item) => item.productId.toString())
      : [];

    res.status(200).json({ status: true, productIds });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const productId = req.body.productId;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ status: false, message: "Please log in to add to wishlist" });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({ userId, Product: [] });
    }

    if (
      wishlist.Product.some(
        (item) => item.productId && item.productId.toString() === productId
      )
    ) {
      return res
        .status(200)
        .json({ status: false, message: "Product already in wishlist" });
    }

    wishlist.Product.push({ productId });
    await wishlist.save();

    return res
      .status(200)
      .json({ status: true, message: "Product added to wishlist" });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Please log in to remove from wishlist" });
    }

    const userData = await User.findById(userId);
    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    await Wishlist.updateOne({ userId }, { $pull: { Product: { productId } } });
     await User.findByIdAndUpdate(
      userId,
      { $pull: { wishlist: productId } },
      { new: true }
    );


    res.status(200).json({ message: "Product removed from wishlist" });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({ message: "An error occurred" });
  }
};



module.exports = {
  loadwishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
};
