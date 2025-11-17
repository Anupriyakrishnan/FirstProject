const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Referral = require("../../models/referralSchema");
const { ObjectId } = require("mongoose").Types;
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const { get } = require("mongoose");
const { log } = require("console");
const fs = require("fs");
const sharp = require("sharp");

function generateOtp() {
  const digits = "1234567890";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

const sendVerificationEmail = async (email, otp) => {
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
    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Your OTP for password reset",
      text: `Your OTP is ${otp}`,
      html: `<b><h4>Your OTP: ${otp}</h4></b>`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email send", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
};

// Authentication Middleware
const ensureAuthenticated = (req, res, next) => {
  console.log("Session:", req.session);
  if (req.session.user && (req.session.user._id || req.session.user)) {
    return next();
  }
  res.status(401).json({ message: "User not authenticated. Please log in." });
};

// const loadProfile = async (req, res) => {
//   try {
//     const user = req.session.user;
//     const userData = await User.findOne({ _id: user });
//     const referral = await Referral.findOne({ userId: user }).lean();
//     if (referral && referral.referralCode) {
//       userData.referralCode = referral.referralCode;
//       // keep session in sync (so client-side checks that read req.session.user will get updated value)
//       if (req.session.user && typeof req.session.user === 'object') {
//         req.session.user.referralCode = referral.referralCode;
//       }
//     }

//     let cartCount = 0;
//     if (req.session.user) {
//       const userCart = await Cart.findOne({ userId: req.session.user._id });
//       if (userCart && userCart.items) {
//         cartCount = userCart.items.length; // Updated from products to items
//       }
//     }
//     return res.render("profile", {
//       user: userData,
//       cartCount,
//       referral: referral || {}
//     });
//   } catch (error) {
//     res.redirect("/pageNotFound");
//   }
// };

const loadProfile = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    const referral = await Referral.findOne({ userId: user }).lean();

    // Initialize referralLink with empty string
    let referralLink = "";

    // Build referral link if referral code exists
    if (referral && referral.referralCode) {
      userData.referralCode = referral.referralCode;

      // Build the full referral link
      const protocol = req.protocol;
      const host = req.get("host");
      referralLink = `${protocol}://${host}/signup?ref=${referral.referralCode}`;

      // keep session in sync
      if (req.session.user && typeof req.session.user === "object") {
        req.session.user.referralCode = referral.referralCode;
      }
    }

    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length;
      }
    }

    // Make sure ALL variables are passed
    return res.render("profile", {
      user: userData,
      cartCount: cartCount,
      referral: referral || {},
      referralLink: referralLink, // ✅ This must be included
    });
  } catch (error) {
    console.error("Error loading profile:", error);
    res.redirect("/pageNotFound");
  }
};

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {}
};

const getForgotPassPage = async (req, res) => {
  try {
    res.render("forgot-password");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email: email });
    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.userOtp = otp;
        req.session.email = email;
        res.render("forgotPass-otp");
        console.log("OTP:", otp);
      } else {
        res.json({
          success: false,
          message: "Failed to send OTP, please try again",
        });
      }
    } else {
      res.render("forgot-password", {
        message: "User with this email does not exist",
      });
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      res.json({ success: false, message: "OTP not matching" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "An error occured. please try again" });
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render("reset-password");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};
const resendOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    const email = req.session.email;
    console.log("Resending OTP to email:", email);
    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP:", otp);
      res.status(200).json({ success: true, message: "Resend OTP Successful" });
    }
  } catch (error) {
    console.error("Error in resend otp ", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
const postNewPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;
    if (newPass1 === newPass2) {
      const passwordHash = await securePassword(newPass1);
      await User.updateOne(
        { email: email },
        { $set: { password: passwordHash } }
      );

      res.redirect("/login");
    } else {
      res.render("reset-password", { message: "Password do not match" });
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const Editprofile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect("/pageNotFound");
    }
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }
    res.render("editProfile", { user: userData, cartCount });
  } catch (error) {
    console.error("Error rendering edit profile page:", error);
    res.redirect("/pageNotFound");
  }
};

// Configure Multer for file uploads (using memory storage for blobs)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpg, jpeg, png) are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("profileImage");

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    res.render("profile", { user, cartCount }); // Assuming your view is named profile.ejs
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: err.message });
    }

    try {
      const userId = req.session.user;
      if (!userId) {
        console.log("No user in session, redirecting to login");
        return res.redirect("/login");
      }

      const { firstName, lastName, phone, username, gender } = req.body;

      // Validate required fields
      if (!firstName || !username) {
        console.log("Validation failed: firstName or username missing");
        return res
          .status(400)
          .json({ message: "First name and username are required" });
      }

      const updateData = {
        firstName,
        lastName: lastName || "",
        phone: phone || "",
        name: username, // Map username to name field in schema
        gender: gender || "Not provided",
      };

      if (req.file) {
        const user = await User.findById(userId);
        if (
          user.profileImage &&
          user.profileImage.startsWith("../uploads/profile/")
        ) {
          const oldImagePath = path.join(
            __dirname,
            "../../public",
            user.profileImage
          );
          try {
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
              console.log(`Deleted old profile image: ${oldImagePath}`);
            }
          } catch (fsError) {
            console.error(
              `Error deleting old profile image: ${fsError.message}`
            );
          }
        }
        // Save the image to disk
        const uploadPath = path.join(__dirname, "../../public/uploads/profile");

        try {
          fs.mkdirSync(uploadPath, { recursive: true });
        } catch (fsError) {
          console.error(`Error creating upload directory: ${fsError.message}`);
          return res.status(500).json({
            message: `Failed to create upload directory: ${fsError.message}`,
          });
        }
        const filename = `${userId}-${Date.now()}.jpg`;
        const filePath = path.join(uploadPath, filename);
        try {
          fs.writeFileSync(filePath, req.file.buffer);

          // FIXED: Use consistent path format
          updateData.profileImage = `/uploads/profile/${filename}`;
        } catch (fsError) {
          console.error(`Error saving profile image: ${fsError.message}`);
          return res.status(500).json({
            message: `Failed to save profile image: ${fsError.message}`,
          });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password");

      if (!updatedUser) {
        console.log("User not found");
        return res.status(404).json({ message: "User not found" });
      }

      console.log("Profile updated successfully");
      res.json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
};

// Email Change Routes
const changeEmail = async (req, res) => {
  try {
    if (!req.session.user) {
      console.log("No user in session");
      return res
        .status(401)
        .json({ message: "User not authenticated. Please log in." });
    }
    const userId = req.session.user._id || req.session.user;

    const { newEmail } = req.body;
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(newEmail, otp);
    if (emailSent) {
      req.session.changeEmailOtp = otp;
      req.session.newEmail = newEmail;
      req.session.userId = userId;
      console.log("Email change OTP:", otp);
      res.json({ success: true, message: "OTP sent to new email" });
    } else {
      res.status(500).json({ message: "Failed to send OTP" });
    }
  } catch (error) {
    console.error("Error in change email:", error);
    res.status(500).json({ message: "Server error" });
  }
};

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const getChangeEmailOtpPage = async (req, res) => {
  try {
    if (
      !req.session.newEmail ||
      !req.session.changeEmailOtp ||
      !req.session.userId
    ) {
      console.log("Missing session data: newEmail, changeEmailOtp, or userId");
      return res.redirect("/profile");
    }
    const userId = req.session.userId;
    console.log("Fetching user with ID:", userId);
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.redirect("/profile");
    }
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    res.render("changeEmailOtp", { user, cartCount });
  } catch (error) {
    console.error("Error rendering OTP page:", error);
    res.redirect("/pageNotFound");
  }
};

const verifyChangeEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (otp === req.session.changeEmailOtp) {
      const userId = req.session.userId;
      const newEmail = req.session.newEmail;
      if (!userId || !newEmail) {
        return res.status(400).json({ message: "Invalid session data" });
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { email: newEmail } },
        { new: true }
      ).select("-password");

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      req.session.user = updatedUser;
      delete req.session.changeEmailOtp;
      delete req.session.newEmail;
      delete req.session.userId;
      res.json({ success: true, message: "Email updated successfully" });
    } else {
      res.json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying email change OTP:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const resendChangeEmailOtp = async (req, res) => {
  try {
    const newEmail = req.session.newEmail;
    if (!newEmail) {
      return res.status(400).json({ message: "No email in session" });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(newEmail, otp);
    if (emailSent) {
      req.session.changeEmailOtp = otp;
      console.log("Resend email change OTP:", otp);
      res.json({ success: true, message: "OTP resent successfully" });
    } else {
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  } catch (error) {
    console.error("Error resending email change OTP:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const loadAddresses = async (req, res) => {
  try {
    const userId = req.session.user._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found, redirecting to login");
      return res.redirect("/login");
    }
    if (user.isBlocked) {
      console.log("User is blocked, redirecting to login");
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
        res.redirect(
          "/login?message=Your account is blocked. Please contact support."
        );
      });
      return;
    }
    let cartCount = 0;
    if (req.session.user) {
      const userCart = await Cart.findOne({ userId: req.session.user._id });
      if (userCart && userCart.items) {
        cartCount = userCart.items.length; // Updated from products to items
      }
    }

    let addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    res.render("address", {
      user,
      addresses,
      message: req.query.message || "",
      cartCount,
    });
  } catch (error) {
    console.error("Error loading addresses:", error);
    res.redirect("/pageNotFound");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user._id || req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }
    if (user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
        return res.status(403).json({
          success: false,
          message: "Your account is blocked. Please contact support.",
        });
      });
      return;
    }

    const {
      name,
      mobile,
      pincode,
      state,
      address,
      locality,
      city,
      addressType,
      openSaturday,
      openSunday,
      isDefault,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !mobile ||
      !pincode ||
      !state ||
      !address ||
      !locality ||
      !city ||
      !addressType
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate pincode (6-digit number)
    if (!/^\d{6}$/.test(pincode)) {
      return res
        .status(400)
        .json({ success: false, message: "Pincode must be a 6-digit number" });
    }

    // Validate mobile (10-digit number)
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Mobile number must be a 10-digit number",
      });
    }

    // Validate addressType
    if (!["home", "office"].includes(addressType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address type" });
    }

    const newAddress = {
      addressType,
      name,
      city,
      landmark: locality, // Map locality to landmark
      state,
      pincode: Number(pincode),
      phone: mobile,
      altPhone: "", // Not provided in form
      isDefault: isDefault === "true",
      openSaturday: openSaturday === "true",
      openSunday: openSunday === "true",
    };

    let addressDoc = await Address.findOne({ userId });
    if (addressDoc) {
      // If setting as default, unset other defaults
      if (newAddress.isDefault) {
        addressDoc.address.forEach((addr) => (addr.isDefault = false));
      }
      addressDoc.address.push(newAddress);
      await addressDoc.save();
    } else {
      addressDoc = new Address({
        userId,
        address: [newAddress],
      });
      await addressDoc.save();
    }

    res
      .status(200)
      .json({ success: true, message: "Address added successfully" });
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// 1. Check your router file to ensure the removeAddress function is properly connected to a PATCH route
// Example route definition that should exist in your routes file:
// router.patch('/address/:addressId', userController.ensureAuthenticated, userController.removeAddress);

// 2. Modify the removeAddress function to ensure correct user ID extraction:
const removeAddress = async (req, res) => {
  try {
    // Validate addressId
    if (!ObjectId.isValid(req.params.addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    // Extract user ID consistently
    const userId = req.session.user;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    // Debugging

    // Find the address document for the user
    const addressDoc = await Address.findOne({ userId: userId });
    if (!addressDoc) {
      return res
        .status(404)
        .json({ success: false, message: "No addresses found for this user" });
    }

    // Check if the address exists
    const addressExists = addressDoc.address.some(
      (addr) => addr._id.toString() === req.params.addressId
    );
    if (!addressExists) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // Remove the address
    addressDoc.address = addressDoc.address.filter(
      (addr) => addr._id.toString() !== req.params.addressId
    );
    await addressDoc.save();

    res.json({ success: true, message: "Address removed successfully" });
  } catch (error) {
    console.error("Error removing address:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const editAddress = async (req, res) => {
  try {
    // Extract user ID from session
    const userId = req.session.user?._id || req.session.user;
    if (!userId) {
      console.log("No user in session");
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    // Verify user exists and is not blocked
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found");
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }
    if (user.isBlocked) {
      console.log("User is blocked");
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
        return res.status(403).json({
          success: false,
          message: "Your account is blocked. Please contact support.",
        });
      });
      return;
    }

    const addressId = req.params.addressId;
    if (!ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const {
      name,
      mobile,
      pincode,
      state,
      address,
      locality,
      city,
      addressType,
      openSaturday,
      openSunday,
      isDefault,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !mobile ||
      !pincode ||
      !state ||
      !address ||
      !locality ||
      !city ||
      !addressType
    ) {
      console.log("Validation failed: Missing required fields", {
        name,
        mobile,
        pincode,
        state,
        address,
        locality,
        city,
        addressType,
      });
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate pincode (6-digit number)
    if (!/^\d{6}$/.test(pincode)) {
      return res
        .status(400)
        .json({ success: false, message: "Pincode must be a 6-digit number" });
    }

    // Validate mobile (10-digit number)
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Mobile number must be a 10-digit number",
      });
    }

    // Validate addressType
    if (!["home", "office"].includes(addressType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address type" });
    }

    // Find address document
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      console.log("No address document found for user");
      return res
        .status(404)
        .json({ success: false, message: "No addresses found" });
    }

    // Find address index
    const addressIndex = addressDoc.address.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      console.log("Address ID not found in user's addresses");
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // Prepare updated address
    const updatedAddress = {
      _id: addressDoc.address[addressIndex]._id,
      addressType,
      name,
      address,
      city,
      landmark: locality,
      state,
      pincode: Number(pincode),
      phone: mobile,
      altPhone: addressDoc.address[addressIndex].altPhone || "",
      isDefault: isDefault === true || isDefault === "true",
      openSaturday: openSaturday === true || openSaturday === "true",
      openSunday: openSunday === true || openSunday === "true",
    };

    // If setting as default, unset other defaults
    if (updatedAddress.isDefault) {
      addressDoc.address.forEach((addr) => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    // Update address
    addressDoc.address[addressIndex] = updatedAddress;
    await addressDoc.save();

    res
      .status(200)
      .json({ success: true, message: "Address updated successfully" });
  } catch (error) {
    console.error("Error editing address:", error);
    res.status(500).json({
      success: false,
      message: error.message.includes("validation failed")
        ? "Invalid address data"
        : "Server error",
      error: error.message,
    });
  }
};

const getAddress = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    const addressId = req.params.addressId;

    if (!ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res
        .status(404)
        .json({ success: false, message: "No addresses found" });
    }

    const address = addressDoc.address.find(
      (addr) => addr._id.toString() === addressId
    );
    if (!address) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    res.json({ success: true, address });
  } catch (error) {
    console.error("Error fetching address:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const selectAddress = async (req, res) => {
  try {
    const { addressId } = req.body;

    if (!addressId || !ObjectId.isValid(addressId)) {
      console.error("Invalid or missing addressId:", addressId);
      return res
        .status(400)
        .json({ success: false, message: "Valid address ID is required" });
    }

    const userId = req.session.user?._id || req.session.user;
    if (!userId || !ObjectId.isValid(userId)) {
      console.error(
        "User not authenticated: Invalid or missing user ID in session",
        userId
      );
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error(`User not found for ID: ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.isBlocked) {
      console.error(`User ${userId} is blocked`);
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. Please contact support.",
      });
    }

    const addressDoc = await Address.findOne({ userId });
    if (
      !addressDoc ||
      !Array.isArray(addressDoc.address) ||
      addressDoc.address.length === 0
    ) {
      console.error(`No addresses found for user ${userId}`);
      return res
        .status(400)
        .json({ success: false, message: "No addresses found for this user" });
    }

    const address = addressDoc.address.find(
      (addr) => addr._id.toString() === addressId
    );
    if (!address) {
      console.error(`Address not found for ID: ${addressId} in user ${userId}`);
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    user.selectedAddress = new ObjectId(addressId);
    await user.save();

    res.json({ success: true, message: "Address selected successfully" });
  } catch (error) {
    console.error("Error in /selectAddress:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again.",
      error: error.message,
    });
  }
};

module.exports = {
  loadProfile,
  updateProfile,
  Editprofile,
  getProfile,
  updateProfile,
  changeEmail,
  getChangeEmailOtpPage,
  verifyChangeEmailOtp,
  resendChangeEmailOtp,
  ensureAuthenticated,
  getForgotPassPage,
  forgotEmailValid,
  sendVerificationEmail,
  verifyForgotPassOtp,
  getResetPassPage,
  resendOtp,
  postNewPassword,
  loadAddresses,
  addAddress,
  ensureAuthenticated,
  removeAddress,
  editAddress,
  getAddress,
  selectAddress,
};
