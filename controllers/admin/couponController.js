const Coupon = require("../../models/couponSchema");

const getCouponPage = async (req, res) => {
  try {
    const coupons = await Coupon.find().lean();
    const successMessage = req.query.success ? "Coupon added successfully" : null;
    res.render("coupon", { coupons, error: null, success: successMessage });
  } catch (error) {
    console.error("Error loading coupon page:", error);
    res.status(500).render("coupon", { coupons: [], error: "Failed to load coupons", success: null });
  }
};

const addCoupon = async (req, res) => {
  try {
    const { name, offerPrice, minimunPrice, expireOn } = req.body;

    // Server-side validation
    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9\s]{3,}$/.test(name)) {
      return res.status(400).render("coupon", {
        coupons: await Coupon.find().lean(),
        error: "Coupon name must be at least 3 characters long and contain only letters, numbers, and spaces",
        success: null
      });
    }

    // Check for duplicate coupon name (case-insensitive)
    const existingCoupon = await Coupon.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
    if (existingCoupon) {
      return res.status(400).render("coupon", {
        coupons: await Coupon.find().lean(),
        error: "A coupon with this name already exists",
        success: null
      });
    }

    const offerPriceNum = Number(offerPrice);
    if (isNaN(offerPriceNum) || offerPriceNum < 0) {
      return res.status(400).render("coupon", {
        coupons: await Coupon.find().lean(),
        error: "Offer price must be a positive number",
        success: null
      });
    }

    const minimunPriceNum = Number(minimunPrice);
    if (isNaN(minimunPriceNum) || minimunPriceNum < 0) {
      return res.status(400).render("coupon", {
        coupons: await Coupon.find().lean(),
        error: "Minimum price must be a positive number",
        success: null
      });
    }

    const expireDate = new Date(expireOn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(expireDate.getTime()) || expireDate <= today) {
      return res.status(400).render("coupon", {
        coupons: await Coupon.find().lean(),
        error: "Expiration date must be in the future",
        success: null
      });
    }

    const coupon = new Coupon({
      name,
      offerPrice: offerPriceNum,
      minimunPrice: minimunPriceNum,
      createdOn: new Date(),
      expireOn: expireDate,
      isList: false,
      userId: []
    });

    await coupon.save();
    res.redirect("/admin/coupon?success=true");
  } catch (error) {
    console.error("Error adding coupon:", error);
    res.status(500).render("coupon", {
      coupons: await Coupon.find().lean(),
      error: "Failed to add coupon: " + error.message,
      success: null
    });
  }
};

const editCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const { name, offerPrice, minimunPrice, expireOn } = req.body;

    // Server-side validation
    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9\s]{3,}$/.test(name)) {
      return res.status(400).json({ error: "Coupon name must be at least 3 characters long and contain only letters, numbers, and spaces" });
    }

    // Check for duplicate coupon name (excluding the current coupon)
    const existingCoupon = await Coupon.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      _id: { $ne: couponId }
    });
    if (existingCoupon) {
      return res.status(400).json({ error: "A coupon with this name already exists" });
    }

    const offerPriceNum = Number(offerPrice);
    if (isNaN(offerPriceNum) || offerPriceNum < 0) {
      return res.status(400).json({ error: "Offer price must be a positive number" });
    }

    const minimunPriceNum = Number(minimunPrice);
    if (isNaN(minimunPriceNum) || minimunPriceNum < 0) {
      return res.status(400).json({ error: "Minimum price must be a positive number" });
    }

    const expireDate = new Date(expireOn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(expireDate.getTime()) || expireDate <= today) {
      return res.status(400).json({ error: "Expiration date must be in the future" });
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      {
        name,
        offerPrice: offerPriceNum,
        minimunPrice: minimunPriceNum,
        expireOn: expireDate
      },
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.status(200).json({ message: "Coupon updated successfully" });
  } catch (error) {
    console.error("Error editing coupon:", error);
    res.status(500).json({ error: "Failed to edit coupon: " + error.message });
  }
};

const toggleListCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Toggling coupon", id);

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    coupon.isList = !coupon.isList;
    await coupon.save();

    return res.status(200).json({
      message: "Coupon status toggled",
      isList: coupon.isList
    });
  } catch (err) {
    console.error("Error toggling coupon:", err);
    return res.status(500).json({ error: "Failed to toggle coupon status: " + err.message });
  }
};

module.exports = { 
  getCouponPage, 
  addCoupon, 
  editCoupon, 
  toggleListCoupon 
};