const express = require("express");
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const {userAuth,adminAuth} = require('../middlewares/auth')
const multer = require("multer");


const customerController = require("../controllers/admin/customerController")
const categoryController = require("../controllers/admin/categoryController")
const productController = require("../controllers/admin/productController")
const brandController = require("../controllers/admin/brandController")
const orderController = require("../controllers/admin/orderController")
const couponController = require("../controllers/admin/couponController")
const offerController = require("../controllers/admin/offerController")
const salesController = require('../controllers/admin/salesController')
const upload = require("../helpers/multer")


//login management
router.get("/pageerror",adminController.pageerror)
router.get("/login",adminController.loadLogin);
router.post('/login',adminController.login);
router.get('/dashboard',adminAuth,adminController.loadDashboard)
router.get('/logout',adminController.logout)

//customer management
router.get("/users", adminAuth, customerController.customerInfo);
router.patch('/blockCustomer/:id',adminAuth,customerController.customerBlocked)
router.patch('/unblockCustomer/:id',adminAuth,customerController.customerunBlocked)

//category management
router.get('/category',adminAuth, categoryController.categoryInfo);
router.post('/addCategory',adminAuth, categoryController.addCategory);
router.patch('/categorylisted/:id',adminAuth, categoryController.categorylisted);
router.patch('/categoryunlisted/:id',adminAuth, categoryController.categoryunlisted);
router.get('/getEditCategory',adminAuth, categoryController.getEditCategory);
router.post('/editCategory',adminAuth, categoryController.editCategory);
router.patch('/deleteCategory/:id',adminAuth, categoryController.deleteCategory);

//brand management
router.get("/brands",brandController.brandInfo);
router.post("/addBrand",brandController.addBrand);
router.patch("/brandlisted/:id",brandController.brandlisted);
router.patch("/brandunlisted/:id",brandController.brandunlisted);
router.get("/getEditBrand",brandController.getEditBrand);
router.put('/editBrand', brandController.editBrand);
router.patch("/deleteBrand/:id",brandController.deleteBrand)


// product management
router.get("/products", productController.productInfo);
router.get("/addProducts", adminAuth, productController.getProductAddPage);
router.post('/add-product', adminAuth, upload.array('images', 10), productController.processImages, productController.addProducts);
router.post("/edit-product", adminAuth, upload.array('images', 10), productController.processImages, productController.editProduct);
router.patch("/productList/:id", adminAuth, productController.productListed);
router.patch("/productUnlist/:id", adminAuth, productController.productUnlisted);
router.patch("/delete-product/:id", adminAuth, productController.deleteProduct);

//order management 
router.get('/order',adminAuth, orderController.orderInfo);
router.get("/order-details",adminAuth, orderController.orderdetailsInfo);
router.put('/orders/:orderId/status', adminAuth, orderController.updateOrderStatus);
router.post('/orders/:orderId/return-item', adminAuth,orderController.handleReturnAction);


//coupon management 
router.get("/coupon", adminAuth, couponController.getCouponPage);
router.post("/coupon/add", adminAuth, couponController.addCoupon);
router.put("/coupon/edit/:couponId", adminAuth, couponController.editCoupon);
router.patch("/coupon/toggle-list/:id", adminAuth, couponController.toggleListCoupon);


//offer management
router.get("/offers", adminAuth, offerController.getOfferPage);
router.post("/add-offer", adminAuth, offerController.addOffer);
router.post("/edit-product-offer/:offerId", adminAuth, offerController.editProductOffer);
router.put("/edit-category-offer/:offerId", adminAuth, offerController.editCategoryOffer);
router.patch("/delete-product-offer/:id", adminAuth, offerController.deleteProductOffer);
router.patch("/delete-category-offer/:id", adminAuth, offerController.deleteCategoryOffer);

//sales management
router.get('/sales-report', salesController.getSalesReport);
router.get('/download', salesController.downloadReport);


module.exports = router;