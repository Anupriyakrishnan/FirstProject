const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Offer = require("../../models/offerSchema");

const getOfferPage = async (req, res) => {
  try {
    const currentDate = new Date();
    const [products, categories, offers] = await Promise.all([
      Product.find().lean(),
      Category.find().lean(),
      Offer.find()
        .populate("productItem.product")
        .populate("categoryItem.category")
        .lean(),
    ]);

    const activeProductOffers = offers
      .flatMap((o) => o.productItem)
      .filter((item) => new Date(item.endDate) >= currentDate);
    const activeCategoryOffers = offers
      .flatMap((o) => o.categoryItem)
      .filter((item) => new Date(item.endDate) >= currentDate);

    return res.render("offers", {
      products,
      categories,
      productOffers: activeProductOffers,
      categoryOffers: activeCategoryOffers,
      error: null,
    });
  } catch (error) {
    console.error("Error loading offer page:", error);
    return res.redirect("/pageerror");
  }
};

const addOffer = async (req, res) => {
  try {
    const { offerType, productId, categoryId, offerName, discount, startDate, endDate } = req.body;
    console.log("Request Body:", req.body);

    if (!offerType || !["product", "category"].includes(offerType)) {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Invalid offer type",
      });
    }
    if (!offerName || typeof offerName !== "string" || offerName.trim() === "") {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Offer name is required and must be a non-empty string",
      });
    }
    if (!discount || isNaN(discount) || discount < 0 || discount > 100) {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Discount must be a number between 0 and 100",
      });
    }
    if (!startDate || !endDate || new Date(startDate) >= new Date(endDate)) {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Invalid dates: Start date must be before end date",
      });
    }
    if (offerType === "product" && !productId) {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Product ID is required for product offers",
      });
    }
    if (offerType === "category" && !categoryId) {
      return res.status(400).render("offers", {
        products: await Product.find().lean(),
        categories: await Category.find().lean(),
        productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
        categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
        error: "Category ID is required for category offers",
      });
    }

    let offer = await Offer.findOne();

    const newOfferItem = {
      [offerType === "product" ? "product" : "category"]:
        offerType === "product" ? productId : categoryId,
      offerName: offerName.trim(),
      discount: Number(discount),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    };

    if (!offer) {
      const offerData = {
        productItem: offerType === "product" ? [newOfferItem] : [],
        categoryItem: offerType === "category" ? [newOfferItem] : [],
        couponItem: [],
      };
      offer = new Offer(offerData);
    } else {
      offer.productItem.forEach(item => {
        if (!item.offerName) {
          item.offerName = "Product Offer";
        }
      });

      offer.categoryItem.forEach(item => {
        if (!item.offerName) {
          item.offerName = "Category Offer";
        }
      });

      offer[offerType === "product" ? "productItem" : "categoryItem"].push(newOfferItem);
    }

    console.log("Offer document before save:", JSON.stringify(offer, null, 2));
    await offer.save({ validateModifiedOnly: true });
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).render("offers", {
      products: await Product.find().lean(),
      categories: await Category.find().lean(),
      productOffers: (await Offer.find().lean()).flatMap((o) => o.productItem),
      categoryOffers: (await Offer.find().lean()).flatMap((o) => o.categoryItem),
      error: "Failed to add offer: " + error.message,
    });
  }
};

const editProductOffer = async (req, res) => {
  try {
    console.log("Editing product offer with params:", req.params);
    console.log("Request body:", req.body);

    const { offerId } = req.params;
    const { offerName, productId, discount, startDate, endDate } = req.body;

    if (
      !offerName ||
      !productId ||
      !discount ||
      discount < 0 ||
      discount > 100 ||
      !startDate ||
      !endDate ||
      new Date(startDate) >= new Date(endDate)
    ) {
      console.log("Validation failed:", { offerName, productId, discount, startDate, endDate });
      return res.status(400).json({ error: "Invalid input or dates" });
    }

    const offer = await Offer.findOne();
    if (!offer) {
      console.log("Offer document not found");
      return res.status(404).json({ error: "Offer document not found" });
    }

    const productOffer = offer.productItem.id(offerId);
    if (!productOffer) {
      console.log("Product offer not found for ID:", offerId);
      return res.status(404).json({ error: "Product offer not found" });
    }

    // Verify product exists
    const productExists = await Product.findById(productId).lean();
    if (!productExists) {
      console.log("Product not found for ID:", productId);
      return res.status(400).json({ error: "Selected product does not exist" });
    }

    productOffer.offerName = offerName;
    productOffer.product = productId;
    productOffer.discount = Number(discount);
    productOffer.startDate = new Date(startDate);
    productOffer.endDate = new Date(endDate);

    offer.productItem.forEach(item => {
      if (!item.offerName && item._id.toString() !== offerId) {
        item.offerName = "Product Offer";
      }
    });

    offer.categoryItem.forEach(item => {
      if (!item.offerName) {
        item.offerName = "Category Offer";
      }
    });

    console.log("Saving updated offer:", JSON.stringify(offer, null, 2));
    await offer.save({ validateModifiedOnly: true });

    res.status(200).json({
      message: "Product offer updated successfully",
      offerName,
      applicable: productExists?.productName || "Unknown",
      discount,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Error editing product offer:", error);
    res.status(500).json({ error: "Failed to edit product offer: " + error.message });
  }
};

const editCategoryOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { offerName, categoryId, discount, startDate, endDate } = req.body;

    if (
      !offerName ||
      !categoryId ||
      !discount ||
      discount < 0 ||
      discount > 100 ||
      !startDate ||
      !endDate ||
      new Date(startDate) >= new Date(endDate)
    ) {
      return res.status(400).json({ error: "Invalid input or dates" });
    }

    const offer = await Offer.findOne();
    if (!offer) {
      return res.status(404).json({ error: "Offer document not found" });
    }

    const categoryOffer = offer.categoryItem.id(offerId);
    if (!categoryOffer) {
      return res.status(404).json({ error: "Category offer not found" });
    }

    const categoryExists = await Category.findById(categoryId).lean();
    if (!categoryExists) {
      return res.status(400).json({ error: "Selected category does not exist" });
    }

    categoryOffer.offerName = offerName;
    categoryOffer.category = categoryId;
    categoryOffer.discount = Number(discount);
    categoryOffer.startDate = new Date(startDate);
    categoryOffer.endDate = new Date(endDate);

    offer.productItem.forEach(item => {
      if (!item.offerName) {
        item.offerName = "Product Offer";
      }
    });

    offer.categoryItem.forEach(item => {
      if (!item.offerName && item._id.toString() !== offerId) {
        item.offerName = "Category Offer";
      }
    });

    await offer.save({ validateModifiedOnly: true });

    res.status(200).json({
      message: "Category offer updated successfully",
      offerName,
      applicable: categoryExists?.name || "Unknown",
      discount,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Error editing category offer:", error);
    res.status(500).json({ error: "Failed to edit category offer: " + error.message });
  }
};

const deleteProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findOne();
    if (!offer) {
      return res.status(404).json({ error: "Offer document not found" });
    }

    const productOfferIndex = offer.productItem.findIndex(
      (item) => item._id.toString() === id
    );
    if (productOfferIndex === -1) {
      return res.status(404).json({ error: "Product offer not found" });
    }

    offer.productItem.splice(productOfferIndex, 1);
    await offer.save();

    res.status(200).json({ message: "Product offer deleted successfully" });
  } catch (error) {
    console.error("Error deleting product offer:", error);
    res.status(500).json({ error: "Failed to delete product offer: " + error.message });
  }
};

const deleteCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findOne();
    if (!offer) {
      return res.status(404).json({ error: "Offer document not found" });
    }

    const categoryOfferIndex = offer.categoryItem.findIndex(
      (item) => item._id.toString() === id
    );
    if (categoryOfferIndex === -1) {
      return res.status(404).json({ error: "Category offer not found" });
    }

    offer.categoryItem.splice(categoryOfferIndex, 1);
    await offer.save();

    res.status(200).json({ message: "Category offer deleted successfully" });
  } catch (error) {
    console.error("Error deleting category offer:", error);
    res.status(500).json({ error: "Failed to delete category offer: " + error.message });
  }
};

module.exports = {
  getOfferPage,
  addOffer,
  editProductOffer,
  editCategoryOffer,
  deleteProductOffer,
  deleteCategoryOffer,
};