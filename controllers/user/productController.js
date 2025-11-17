const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Offer = require("../../models/offerSchema");
const Cart = require("../../models/cartSchema");

const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const search = req.query.search;
    const page = parseInt(req.query.page);
    const limit = 4;

    const productId = req.query.id;
    const product = await Product.findById(productId)
      .populate("category")
      .populate("brand");

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

    let mainProductOffer = null;
    let maxDiscount = 0;
    let discountedPrice = product.salePrice;

    offers.forEach((offer) => {
      offer.productItem.forEach((pi) => {
        if (
          pi.product.toString() === product._id.toString() &&
          new Date(pi.startDate) <= currentDate &&
          new Date(pi.endDate) > currentDate &&
          pi.discount > maxDiscount
        ) {
          maxDiscount = pi.discount;
          mainProductOffer = {
            discount: pi.discount,
            offerName: pi.offerName,
            type: "Product Offer",
          };
          discountedPrice = product.salePrice * (1 - pi.discount / 100);
        }
      });

      offer.categoryItem.forEach((ci) => {
        if (
          ci.category.toString() === product.category?._id.toString() &&
          new Date(ci.startDate) <= currentDate &&
          new Date(ci.endDate) > currentDate && // Fixed: Changed 'pi' to 'ci'
          ci.discount > maxDiscount
        ) {
          maxDiscount = ci.discount;
          mainProductOffer = {
            discount: ci.discount,
            offerName: ci.offerName,
            type: "Category Offer",
          };
          discountedPrice = product.salePrice * (1 - ci.discount / 100);
        }
      });
    });

    const productWithOffer = {
      ...product.toObject(),
      offer: mainProductOffer,
      discountedPrice: Math.round(discountedPrice * 100) / 100,
    };

    let relatedQuery = {
      _id: { $ne: productId },
      isBlocked: false,
      isListed: true,
    };

    if (search) {
      relatedQuery.productName = { $regex: search, $options: "i" };
    }

    const relatedProducts = await Product.find(relatedQuery)
      .populate("category")
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const relatedProductsWithOffers = relatedProducts.map((relatedProduct) => {
      let relatedOffer = null;
      let maxDiscount = 0;
      let discountedPrice = relatedProduct.salePrice;

      offers.forEach((offer) => {
        offer.productItem.forEach((pi) => {
          if (
            pi.product.toString() === relatedProduct._id.toString() &&
            new Date(pi.startDate) <= currentDate &&
            new Date(pi.endDate) > currentDate &&
            pi.discount > maxDiscount
          ) {
            maxDiscount = pi.discount;
            relatedOffer = {
              discount: pi.discount,
              offerName: pi.offerName,
              type: "Product Offer",
            };
            discountedPrice =
              relatedProduct.salePrice * (1 - pi.discount / 100);
          }
        });

        offer.categoryItem.forEach((ci) => {
          if (
            ci.category.toString() ===
              relatedProduct.category?._id.toString() &&
            new Date(ci.startDate) <= currentDate &&
            new Date(ci.endDate) > currentDate &&
            ci.discount > maxDiscount
          ) {
            maxDiscount = ci.discount;
            relatedOffer = {
              discount: ci.discount,
              offerName: ci.offerName,
              type: "Category Offer",
            };
            discountedPrice =
              relatedProduct.salePrice * (1 - ci.discount / 100);
          }
        });
      });

      return {
        ...relatedProduct.toObject(),
        offer: relatedOffer,
        discountedPrice: Math.round(discountedPrice * 100) / 100,
      };
    });

    const totalRelatedProducts = await Product.countDocuments(relatedQuery);
    const totalPages = Math.ceil(totalRelatedProducts / limit);
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    res.render("product-details", {
      user: userData,
      product: productWithOffer,
      relatedProducts: relatedProductsWithOffers,
      currentPage: page,
      totalPages,
      searchQuery: search,
      cartCount,
    });
  } catch (error) {
    console.error("Error for fetching details", error);
    res.redirect("/pageNotFound");
  }
};
module.exports = {
  productDetails,
};
