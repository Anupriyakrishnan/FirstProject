const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Offer = require("../../models/offerSchema");
const Cart = require("../../models/cartSchema");
const Wallet = require("../../models/walletSchema");
const Referral = require("../../models/referralSchema");
const {
  generateUniqueReferral,
} = require("../../controllers/user/referralController");

const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const SITE_URL = process.env.SITE_URL || "http://localhost:4000";
const REFERRAL_REWARD = 1000;

const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadSignup = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    console.log("Home page not loading", error);
    res.status(500).send("Server Error");
  }
};

const loadHomepage = async (req, res) => {
  try {
    const user = req.session.user;
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    const categories = await Category.find({ isListed: true });
    let productData = await Product.find({
      isBlocked: false,
      isListed: true,
      category: { $in: categories.map((category) => category._id) },
      quantity: { $gt: 0 },
    })
      .populate("category")
      .populate("brand");
    productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
    productData = productData.slice(0, 8);

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

    const productsWithOffers = productData.map((product) => {
      let applicableOffer = null;
      let discountedPrice = product.salePrice;

      offers.forEach((offer) => {
        offer.productItem.forEach((item) => {
          if (
            item.product.toString() === product._id.toString() &&
            new Date(item.startDate) <= currentDate &&
            (item.endDate === null || new Date(item.endDate) > currentDate)
          ) {
            applicableOffer = {
              discount: item.discount,
              offerName: item.offerName,
            };
            discountedPrice = product.salePrice * (1 - item.discount / 100);
          }
        });
      });

      if (!applicableOffer) {
        offers.forEach((offer) => {
          offer.categoryItem.forEach((item) => {
            if (
              item.category.toString() === product.category._id.toString() &&
              new Date(item.startDate) <= currentDate &&
              (item.endDate === null || new Date(item.endDate) > currentDate)
            ) {
              applicableOffer = {
                discount: item.discount,
                offerName: item.offerName,
              };
              discountedPrice = product.salePrice * (1 - item.discount / 100);
            }
          });
        });
      }

      return {
        ...product.toObject(),
        offer: applicableOffer,
        discountedPrice: Math.round(discountedPrice * 100) / 100,
      };
    });

    if (user) {
      const userData = await User.findOne({ _id: user });
      res.render("home", {
        user: userData,
        products: productsWithOffers,
        offers,
        cartCount,
      });
    } else {
      return res.render("home", {
        user: null,
        products: productsWithOffers,
        offers,
        cartCount,
      });
    }
  } catch (error) {
    console.log("home page not found");
    res.status(500).send("Server error");
  }
};

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {}
};

// SIGNUP - Store user data in session
const signup = async (req, res) => {
  try {
    const { name, email, phone, password, cPassword, referralCode } = req.body;

    console.log("=== SIGNUP REQUEST ===");
    console.log("Name:", name);
    console.log("Email:", email);
    console.log("Phone:", phone);
    console.log("Referral Code:", referralCode);

    // Validate passwords match
    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    // Check if user already exists
    const findUser = await User.findOne({ email: email });
    if (findUser) {
      return res.render("signup", {
        message: "User with this email already exists",
      });
    }

    // Generate and send OTP
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json({ success: false, message: "Failed to send OTP" });
    }

    // Store OTP and user data in session
    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000; // 60 seconds
    req.session.userData = {
      name,
      email,
      phone,
      password,
      referralCode:
        referralCode && String(referralCode).trim()
          ? String(referralCode).trim().toUpperCase()
          : null,
    };

    console.log("OTP generated:", otp);
    console.log("Session userData:", req.session.userData);

    res.render("verify-otp");
  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/pageNotFound");
  }
};

// VERIFY OTP - Create user and process referral
const verifyOtp = async (req, res) => {
  try {
    let { otp } = req.body;

    console.log("\n=== OTP VERIFICATION START ===");
    console.log("Received OTP:", otp);
    console.log("Session OTP:", req.session.userOtp);
    console.log("Session User Data:", req.session.userData);

    // Validate OTP format
    otp = String(otp || "").trim();
    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    // Check if session data exists
    if (!req.session.userOtp || !req.session.userData) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please signup again.",
      });
    }

    // Check OTP expiry
    if (Date.now() >= req.session.otpExpires) {
      delete req.session.userOtp;
      delete req.session.otpExpires;
      delete req.session.userData;
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Verify OTP match
    const sessionOtp = String(req.session.userOtp).trim();
    if (otp !== sessionOtp) {
      console.log("❌ OTP mismatch. Expected:", sessionOtp, "Got:", otp);
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    console.log("✅ OTP verified successfully");

    // Get user data and clear OTP session immediately
    const userDataCopy = { ...req.session.userData };
    delete req.session.userOtp;
    delete req.session.otpExpires;
    delete req.session.userData;

    if (!userDataCopy.password) {
      return res.status(400).json({
        success: false,
        message: "User data incomplete",
      });
    }

    // Hash password
    const passwordHash = await securePassword(userDataCopy.password);

    // Build new user object
    const userObj = {
      name: userDataCopy.name,
      email: userDataCopy.email,
      phone: userDataCopy.phone,
      password: passwordHash,
      redeemedUsers: [],
    };

    // Check if referral code was provided
    let referralCodeUsed = userDataCopy.referralCode || null;
    if (referralCodeUsed) {
      userObj.referredBy = referralCodeUsed;
      console.log("📋 User B using referral code:", referralCodeUsed);
    }

    // Generate unique referral code for new user (User B)
    userObj.referralCode = await generateUniqueReferral(8);
    userObj.referralLink = `${SITE_URL}/signup?ref=${userObj.referralCode}`;

    console.log("Generated referral code for User B:", userObj.referralCode);

    // Save new user (User B)
    let newUser;
    try {
      newUser = await new User(userObj).save();
      console.log("✅ User B created:", newUser._id, newUser.email);
      console.log("✅ User B's referral code:", newUser.referralCode);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.referralCode) {
        console.log("⚠️ Duplicate referral code, regenerating...");
        userObj.referralCode = await generateUniqueReferral(8);
        userObj.referralLink = `${SITE_URL}/signup?ref=${userObj.referralCode}`;
        newUser = await new User(userObj).save();
        console.log("✅ User B created with new code:", newUser._id);
      } else {
        console.error("❌ User save error:", err);
        return res.status(500).json({
          success: false,
          message: "Error creating account. Please try again.",
        });
      }
    }

    // Create Referral document for User B
    try {
      const newUserReferral = new Referral({
        userId: newUser._id,
        referralCode: newUser.referralCode,
        referredUsers: [],
        isActive: true,
      });
      await newUserReferral.save();
      console.log("✅ Referral document created for User B");
    } catch (refErr) {
      console.error("⚠️ Error creating referral document:", refErr);
    }

    // ===== PROCESS REFERRAL REWARD FOR USER A =====
    let rewardMessage = "Account created successfully!";

    if (referralCodeUsed) {
      try {
        console.log("\n🎁 PROCESSING REFERRAL REWARD");
        console.log("Looking for User A with code:", referralCodeUsed);

        // Find User A (the referrer)
        const userA = await User.findOne({
          referralCode: referralCodeUsed,
        });

        if (!userA) {
          console.log("⚠️ Referral code not found:", referralCodeUsed);
          rewardMessage = "Account created successfully!";
        } else {
          console.log(`✅ User A found: ${userA.name} (${userA.email})`);
          console.log(`   User A ID: ${userA._id}`);

          // Check if User B already rewarded User A (prevent duplicate)
          const alreadyRewarded =
            userA.redeemedUsers &&
            userA.redeemedUsers.some(
              (userId) => userId.toString() === newUser._id.toString()
            );

          if (alreadyRewarded) {
            console.log("⚠️ Reward already given to User A for User B");
            rewardMessage = "Account created! (Referral already credited)";
          } else {
            console.log(
              `💰 Crediting ₹${REFERRAL_REWARD} to User A's wallet...`
            );

            // CREATE TRANSACTION DESCRIPTION
            const txDescription = `Referral bonus - ${newUser.name} (${newUser.email}) joined using code ${referralCodeUsed}`;
            const txDate = new Date();

            // STEP 1: Update Referral document - add User B to User A's referredUsers
            await Referral.updateOne(
              { referralCode: referralCodeUsed },
              {
                $setOnInsert: {
                  userId: userA._id,
                  referralCode: referralCodeUsed,
                  isActive: true,
                  createdAt: new Date(),
                },
                $addToSet: { referredUsers: newUser._id },
              },
              { upsert: true }
            );
            console.log("✅ User B added to User A's referral list");

            // STEP 2: Find or create User A's Wallet and UPDATE balance and transactions
            let walletDoc = await Wallet.findOne({ userId: userA._id });

            if (walletDoc) {
              // WALLET EXISTS - Update it atomically
              console.log("📝 Wallet exists for User A, updating...");
              console.log("   Current balance:", walletDoc.balance);

              walletDoc = await Wallet.findOneAndUpdate(
                { userId: userA._id },
                {
                  $inc: { balance: REFERRAL_REWARD },
                  $push: {
                    transactions: {
                      $each: [
                        {
                          amount: REFERRAL_REWARD,
                          type: "credit",
                          date: txDate,
                          description: txDescription,
                        },
                      ],
                      $position: 0, // Add to beginning
                    },
                  },
                },
                { new: true } // IMPORTANT: Return updated document
              );

              console.log(`✅ Wallet updated for User A`);
              console.log(`   New balance: ₹${walletDoc.balance}`);
              console.log(
                `   Total transactions: ${walletDoc.transactions.length}`
              );
            } else {
              // WALLET DOESN'T EXIST - Create new wallet with initial balance
              console.log("🆕 Creating new wallet for User A...");

              walletDoc = await Wallet.create({
                userId: userA._id,
                balance: REFERRAL_REWARD,
                transactions: [
                  {
                    amount: REFERRAL_REWARD,
                    type: "credit",
                    date: txDate,
                    description: txDescription,
                  },
                ],
              });

              console.log(`✅ New wallet created for User A`);
              console.log(`   Initial balance: ₹${walletDoc.balance}`);
            }

            // STEP 3: Link wallet to User A if not already linked
            if (
              !userA.wallet ||
              userA.wallet.toString() !== walletDoc._id.toString()
            ) {
              userA.wallet = walletDoc._id;
              console.log("✅ Wallet linked to User A");
            }

            // STEP 4: Add User B to User A's redeemedUsers array
            if (!userA.redeemedUsers) {
              userA.redeemedUsers = [];
            }
            if (
              !userA.redeemedUsers.some(
                (id) => id.toString() === newUser._id.toString()
              )
            ) {
              userA.redeemedUsers.push(newUser._id);
            }

            // STEP 5: Save User A changes
            await userA.save();
            console.log(
              "✅ User A's account updated with wallet reference and redeemed users"
            );

            console.log("\n🎉 REFERRAL REWARD COMPLETE!");
            console.log(
              `   User A (${userA.name}) received ₹${REFERRAL_REWARD}`
            );
            console.log(`   Total balance: ₹${walletDoc.balance}`);
            console.log(`   Total referrals: ${userA.redeemedUsers.length}\n`);

            rewardMessage = `Account created! Your friend ${userA.name} received ₹${REFERRAL_REWARD} bonus!`;
          }
        }
      } catch (referralError) {
        console.error("❌ Error processing referral reward:", referralError);
        console.error(referralError.stack);
        rewardMessage = "Account created! (Referral processing had an issue)";
      }
    }
    // ===== END REFERRAL REWARD PROCESSING =====

    // Set session for User B (newly registered user)
    req.session.user = newUser._id;

    // Save session
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({
          success: false,
          message: "Session error. Please try logging in.",
        });
      }

      console.log("✅ User B logged in, session saved");
      console.log("=== SIGNUP COMPLETE ===\n");

      return res.json({
        success: true,
        redirectUrl: "/",
        message: rewardMessage,
      });
    });
  } catch (error) {
    console.error("❌ verifyOtp error:", error);
    console.error("Stack trace:", error.stack);
    return res.status(500).json({
      success: false,
      message: "An error occurred. Please try again.",
    });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email not found in session" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 30 * 1000;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP", otp);
      res
        .status(200)
        .json({ success: true, message: "OTP resend successfully" });
    } else {
      res.status(500).json({
        success: false,
        message: "failed to resend OTP. Please try again",
      });
    }
  } catch (error) {
    console.error("Error resending OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal server Error. Please try again",
    });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("login");
    } else {
      res.redirect("/");
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.render("login", { message: "User not found" });
    }
    if (findUser.isBlocked) {
      return res.render("login", { message: "User is blocked by admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res.render("login", { message: "Incorrect Password" });
    }
    req.session.user = findUser._id;
    res.redirect("/");
  } catch (error) {
    console.error("login error", error);
    res.render("login", { message: "login failed. please try again later" });
  }
};

const loadLogout = async (req, res) => {
  try {
    req.session.destroy((error) => {
      if (error) {
        console.log("Session destruction error", error.message);
        return res.redirect("/pageNotFound");
      }
      return res.redirect("/login");
    });
  } catch (error) {
    console.log("Logout error", error);
    res.redirect("/pageNotFound");
  }
};

const querystring = require("querystring");

const loadShoppingPage = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    });

    // const categoryIds = categories.map((category) => category._id.toString());
    const brands = await Brand.find({ isDeleted: false, isListed: true });

    const page = parseInt(req.query.page) || 1;
    const query = req.query.query || "";
    const limit = 6;
    const skip = (page - 1) * limit;

    const filter = {
      isBlocked: false,
      isListed: true,
      category: { $in: categories },
      brand: { $in: brands },
      quantity: { $gt: 0 },
    };

    if (query) {
      filter.productName = { $regex: query, $options: "i" };
    }

    const products = await Product.find(filter)
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .populate("brand")
      .populate("category");

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

    const productsWithOffers = products.map((product) => {
      let applicableOffer = null;
      let discountedPrice = product.salePrice;
      let maxDiscount = 0;

      offers.forEach((offer) => {
        offer.productItem.forEach((item) => {
          if (
            item.product.toString() === product._id.toString() &&
            new Date(item.startDate) <= currentDate &&
            (item.endDate === null || new Date(item.endDate) > currentDate)
          ) {
            if (item.discount > maxDiscount) {
              maxDiscount = item.discount;
              applicableOffer = {
                discount: item.discount,
                offerName: item.offerName,
                type: "Product Offer",
              };
              discountedPrice = product.salePrice * (1 - item.discount / 100);
            }
          }
        });
      });

      offers.forEach((offer) => {
        offer.categoryItem.forEach((item) => {
          if (
            item.category.toString() === product.category._id.toString() &&
            new Date(item.startDate) <= currentDate &&
            (item.endDate === null || new Date(item.endDate) > currentDate)
          ) {
            if (item.discount > maxDiscount) {
              maxDiscount = item.discount;
              applicableOffer = {
                discount: item.discount,
                offerName: item.offerName,
                type: "Category Offer",
              };
              discountedPrice = product.salePrice * (1 - item.discount / 100);
            }
          }
        });
      });

      return {
        ...product.toObject(),
        offer: applicableOffer,
        discountedPrice: Math.round(discountedPrice * 100) / 100, // Round to 2 decimal places
      };
    });

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const categorieswithIds = categories.map((category) => ({
      _id: category._id,
      name: category.name,
    }));

    const queryParams = {
      query: query || undefined,
      category: req.query.category || undefined,
      brand: req.query.brand || undefined,
      priceRange: req.query.priceRange || undefined,
      sort: req.query.sort || undefined,
    };
    const queryString = querystring.stringify(queryParams);

    res.render("shop", {
      user: userData,
      products: productsWithOffers,
      category: categorieswithIds,
      brand: brands,
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages,
      selectedCategory: req.query.category || "",
      selectedBrand: req.query.brand || "",
      selectedPriceRange: req.query.priceRange || "",
      selectedSort: req.query.sort || "",
      query: query || "",
      queryString,
      offers,
      cartCount,
    });
  } catch (error) {
    console.error("Error in loadShoppingPage:", error);
    res.redirect("/pageNotFound");
  }
};

const filterProduct = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    const {
      category,
      brand,
      priceRange,
      sort,
      page = 1,
      limit = 6,
      query,
    } = req.query;

    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    });
    const brands = await Brand.find({ isListed: true, isDeleted: false });

    const listedCategoryIds = categories.map((category) => category._id);
    const listedBrandIds = brands.map((brand) => brand._id);
    const filter = {
      isListed: true,
      isBlocked: false,
      quantity: { $gt: 0 },
      category: { $in: listedCategoryIds },
      brand: { $in: listedBrandIds },
    };

    if (query) {
      filter.productName = { $regex: query, $options: "i" };
    }

    if (category) {
      filter.category = category;
    }

    if (brand) {
      filter.brand = brand;
    }

    if (priceRange) {
      switch (priceRange) {
        case "under1000":
          filter.salePrice = { $lt: 1000 };
          break;
        case "1000-2000":
          filter.salePrice = { $gte: 1000, $lte: 2000 };
          break;
        case "2000-3000":
          filter.salePrice = { $gte: 2000, $lte: 3000 };
          break;
        case "above3000":
          filter.salePrice = { $gt: 3000 };
          break;
      }
    }

    let sortOption = {};
    if (sort === "price-asc") {
      sortOption.salePrice = 1;
    } else if (sort === "price-desc") {
      sortOption.salePrice = -1;
    } else if (sort === "newest") {
      sortOption.createdAt = -1;
    }

    const skip = (page - 1) * limit;

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .populate("brand")
      .populate("category");

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

    // Process offers for each product
    const productsWithOffers = products.map((product) => {
      let applicableOffer = null;
      let discountedPrice = product.salePrice;
      let maxDiscount = 0;

      // Check for product-specific offer
      offers.forEach((offer) => {
        offer.productItem.forEach((item) => {
          if (
            item.product.toString() === product._id.toString() &&
            new Date(item.startDate) <= currentDate &&
            (item.endDate === null || new Date(item.endDate) > currentDate)
          ) {
            if (item.discount > maxDiscount) {
              maxDiscount = item.discount;
              applicableOffer = {
                discount: item.discount,
                offerName: item.offerName,
                type: "Product Offer",
              };
              discountedPrice = product.salePrice * (1 - item.discount / 100);
            }
          }
        });
      });

      // Check for category-specific offer if no product offer or if category offer has higher discount
      offers.forEach((offer) => {
        offer.categoryItem.forEach((item) => {
          if (
            item.category.toString() === product.category._id.toString() &&
            new Date(item.startDate) <= currentDate &&
            (item.endDate === null || new Date(item.endDate) > currentDate)
          ) {
            if (item.discount > maxDiscount) {
              maxDiscount = item.discount;
              applicableOffer = {
                discount: item.discount,
                offerName: item.offerName,
                type: "Category Offer",
              };
              discountedPrice = product.salePrice * (1 - item.discount / 100);
            }
          }
        });
      });

      return {
        ...product.toObject(),
        offer: applicableOffer,
        discountedPrice: Math.round(discountedPrice * 100) / 100, // Round to 2 decimal places
      };
    });

    const queryParams = {
      query: query || undefined,
      category: category || undefined,
      brand: brand || undefined,
      priceRange: priceRange || undefined,
      sort: sort || undefined,
    };
    const queryString = querystring.stringify(queryParams);

    res.render("shop", {
      user: userData,
      products: productsWithOffers,
      category: categories,
      brand: brands,
      selectedCategory: category || "",
      selectedBrand: brand || "",
      selectedPriceRange: priceRange || "",
      selectedSort: sort || "",
      query: query || "",
      currentPage: Number(page),
      totalPages,
      totalProducts,
      queryString,
      cartCount,
    });
  } catch (err) {
    console.error("Filter error:", err);
    res.status(500).send("Something went wrong");
  }
};

const updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match",
      });
    }

    if (!req.session.user) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const user = await User.findById(req.session.user);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Incorrect old password" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    user.password = passwordHash;
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addTocart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ status: false, message: "Please log in to add to cart" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found" });
    }

    if (quantity < 1 || quantity > product.quantity) {
      return res.status(400).json({
        status: false,
        message: `Invalid quantity. Only ${product.quantity} items available`,
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.totalPrice = existingItem.quantity * existingItem.price;
    } else {
      cart.items.push({
        productId,
        quantity,
        price: product.salePrice,
        totalPrice: product.salePrice * quantity,
      });
    }

    await cart.save();
    res.status(200).json({ status: true, message: "Product added to cart" });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({
      status: false,
      message: "An error occurred while adding to cart",
    });
  }
};

module.exports = {
  loadHomepage,
  pageNotFound,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  loadLogout,
  loadShoppingPage,
  filterProduct,
  updatePassword,
  addTocart,
};
