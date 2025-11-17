const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const profileController = require("../controllers/user/profileController");
const { route } = require("./adminRouter");
const { userAuth } = require("../middlewares/auth");
const productController = require("../controllers/user/productController");
const wishlistController = require("../controllers/user/wishlistController");
const cartController = require("../controllers/user/cartController");
const orderController = require("../controllers/user/orderController");
const referralController = require("../controllers/user/referralController");

router.get("/pageNotFound", userController.pageNotFound);
router.get("/", userController.loadHomepage);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/signup",
  }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect("/");
  }
);
router.get("/logout", userController.loadLogout);
router.get("/login", userController.loadLogin);
router.post("/login", userController.login);

//profile Management
router.get("/profile", userAuth, profileController.loadProfile);
router.put("/update-password", userAuth, userController.updatePassword);
router.put("/editProfile", userAuth, profileController.updateProfile);
router.get("/editProfile", userAuth, profileController.Editprofile);
router.put("/profile", userAuth, profileController.updateProfile);
router.put("/editProfile", userAuth, profileController.updateProfile);
router.get("/address", userAuth, profileController.loadAddresses);
router.post("/addAddress", userAuth, profileController.addAddress);
router.patch(
  "/removeAddress/:addressId",
  userAuth,
  profileController.ensureAuthenticated,
  profileController.removeAddress
);
router.put(
  "/editAddress/:addressId",
  userAuth,
  profileController.ensureAuthenticated,
  profileController.editAddress
);
router.get(
  "/getAddress/:addressId",
  userAuth,
  profileController.ensureAuthenticated,
  profileController.getAddress
);
router.get("/payment", userAuth, cartController.loadpayment);
router.post("/selectAddress", userAuth, profileController.selectAddress);

//order managment
router.get("/ordersuccess", userAuth, orderController.ordersuccesspage);
router.get("/orderfailure", userAuth, orderController.orderfailurepage);
router.post("/createOrder", userAuth, orderController.createOrder);
router.post("/verifyPayment", userAuth, orderController.verifyRazorpay);
router.get("/orders", userAuth, orderController.loadorder);
router.get("/orderdetails", userAuth, orderController.viewOrderDetails);
router.post("/cancel-order", userAuth, orderController.cancelOrder);
router.post("/cancel-item", userAuth, orderController.cancelItem);
router.post("/return-order", userAuth, orderController.returnOrder);
router.post("/return-item", userAuth, orderController.returnItem);
router.get("/wallet", userAuth, orderController.loadwallet);
router.get("/wallet/refresh", userAuth, orderController.refreshWallet);
router.get("/download-invoice", orderController.downloadInvoice);

// router.get("/change-email",userAuth,profileController.changeEmail)
router.get("/forgot-password", profileController.getForgotPassPage);
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);
router.get("/reset-password", profileController.getResetPassPage);
router.post("/resend-forgot-otp", profileController.resendOtp);
router.post("/reset-password", profileController.postNewPassword);

// home page & shop page
// router.get("/",userController.loadHomepage)
router.get("/shop", userAuth, userController.loadShoppingPage);
router.get("/filter", userAuth, userController.filterProduct);

//product management
router.get("/product-details", userAuth, productController.productDetails);

//wishlist management
router.get("/wishlist", userAuth, wishlistController.loadwishlist);
router.post("/addToWishlist", userAuth, wishlistController.addToWishlist);
router.post(
  "/remove-from-wishlist",
  userAuth,
  wishlistController.removeFromWishlist
);
// router.post("/add-to-wishlist", wishlistController.addToWishlist);
router.get("/getWishlist", userAuth, wishlistController.getWishlist);

//cart management
router.get("/cart", userAuth, cartController.loadcart);
router.post("/add-to-cart", userAuth, cartController.addToCart);
router.post("/remove-from-cart", userAuth, cartController.removeFromCart);
router.post("/update-cart-quantity", userAuth, cartController.updateCart);
// Checkout Routes
router.get("/checkout", userAuth, cartController.loadcheckout);
router.get("/payment", userAuth, cartController.loadpayment);
// Coupon Routes
router.post("/apply-coupon", userAuth, cartController.applyCoupon);
router.post("/remove-coupon", userAuth, cartController.removeCoupon);

router.post("/changeEmail", userAuth, profileController.changeEmail);
router.get(
  "/changeEmailOtp",
  userAuth,
  profileController.ensureAuthenticated,
  profileController.getChangeEmailOtpPage
);
router.post(
  "/verifyChangeEmailOtp",
  userAuth,
  profileController.verifyChangeEmailOtp
);
router.post(
  "/resendChangeEmailOtp",
  userAuth,
  profileController.resendChangeEmailOtp
);

//referral
// router.get('/referral/generate', userAuth, referralController.generateReferralCode);
// router.post('/referral/validate', referralController.validateReferralCode);
// router.post('/referral/signup', referralController.handleReferralSignup);
// router.get('/referral/stats', userAuth, referralController.getReferralStats);
router.post("/validate-referral", referralController.validateReferralCode);
module.exports = router;
