const product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const productInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";

    const query = {
      ...(search && { productName: { $regex: search, $options: "i" } }),
      isBlocked: { $ne: true },
    };

    const productData = await product
      .find(query)
      .populate("brand")
      .populate("category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const totalProducts = await product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const brands = await Brand.find({ isListed: true, isDeleted: false });
    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    });

  
    res.render("products", {
      products: productData,
      currentPage: page,
      totalPages: totalPages,
      totalProducts: totalProducts,
      cat: categories,
      search,
      brand: brands,
      

    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Error loading products");
  }
};

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true, isDeleted: false });
    const brand = await Brand.find({ isListed: true, isDeleted: false });

    res.render("product-add", {
      cat: category,
      brand: brand,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const processImages = async (req, res, next) => {
  try {
    if (
      req.route.path === "/edit-product" &&
      (!req.files || req.files.length === 0)
    ) {
      req.processedImages = [];
      return next();
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please upload at least 3 images for new products",
        });
    }

    if (req.route.path === "/add-product" && req.files.length < 3) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res
        .status(400)
        .json({
          success: false,
          message: "Please upload at least 3 images for new products",
        });
    }

    const processedImages = [];

    for (const file of req.files) {
      const outputFilename = `processed-${path.basename(file.path)}`;
      const outputPath = path.join(path.dirname(file.path), outputFilename);

      await sharp(file.path)
        .resize({
          width: 800,
          height: 800,
          fit: sharp.fit.inside,
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      fs.unlinkSync(file.path);

      processedImages.push({
        path: `/uploads/products/${outputFilename}`,
        filename: outputFilename,
      });
    }

    req.processedImages = processedImages;
    next();
  } catch (error) {
    console.error("Image processing error:", error);
    if (req.files) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Error processing images" });
  }
};
const addProducts = async (req, res) => {
  try {
    const {
      productName,
      brand,
      category,
      salePrice,
      material,
      quantity,
      description,
    } = req.body;
    if (
      !productName ||
      !brand ||
      !category ||
      !salePrice ||
      !quantity ||
      !material ||
      !description
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    if (!req.processedImages || req.processedImages.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Please upload at least 3 images",
      });
    }


    const newProduct = new product({
      productName,
      brand,
      category,
      salePrice: parseFloat(salePrice),
      material,
      quantity: parseInt(quantity),
      description,
      productImage: req.processedImages.map((img) => img.path),
      isListed: true,
      isBlocked: false,
    });


    const savedProduct = await newProduct.save();

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    if (req.processedImages) {
      req.processedImages.forEach((img) => {
        const filePath = path.join(__dirname, "../../public", img.path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error adding product",
      error: error.message,
    });
  }
};
const editProduct = async (req, res) => {
  try {
    const {
      productId,
      productName,
      brand,
      category,
      salePrice,
      material,
      quantity,
      description,
      existingImages,
    } = req.body;

    if (
      !productId ||
      !productName ||
      !brand ||
      !category ||
      !salePrice ||
      !quantity ||
      !material ||
      !description
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    const productToUpdate = await product.findById(productId);
    if (!productToUpdate) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let finalImages = Array.isArray(existingImages)
      ? existingImages
      : existingImages
      ? [existingImages]
      : [];

    const imagesToDelete = productToUpdate.productImage.filter(
      (img) => !finalImages.includes(img)
    );
    imagesToDelete.forEach((img) => {
      const filePath = path.join(__dirname, "../../public", img);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    if (req.processedImages) {
      finalImages = [
        ...finalImages,
        ...req.processedImages.map((img) => img.path),
      ];
    }

    if (finalImages.length < 1) {
      if (req.processedImages) {
        req.processedImages.forEach((img) => {
          const filePath = path.join(__dirname, "../../public", img.path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: "At least 1 image is required",
      });
    }

    productToUpdate.productName = productName;
    productToUpdate.brand = brand;
    productToUpdate.category = category;
    productToUpdate.salePrice = parseFloat(salePrice);
    productToUpdate.material = material;
    productToUpdate.quantity = parseInt(quantity);
    productToUpdate.description = description;
    productToUpdate.productImage = finalImages;

    await productToUpdate.save();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: productToUpdate,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    if (req.processedImages) {
      req.processedImages.forEach((img) => {
        const filePath = path.join(__dirname, "../../public", img.path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error updating product",
      error: error.message,
    });
  }
};
const productListed = async (req, res) => {
  try {
    let id = req.params.id;
    await product.findOneAndUpdate(
      { _id: id },
      { $set: { isListed: true } },
      { new: true }
    );
    res.json({ success: true, message: "Product listed successfully" });
  } catch (error) {
    console.error("Error listing product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list product",
    });
  }
};

const productUnlisted = async (req, res) => {
  try {
    let id = req.params.id;
    await product.findOneAndUpdate(
      { _id: id },
      { $set: { isListed: false } },
      { new: true }
    );
    res.json({ success: true, message: "Product unlisted successfully" });
  } catch (error) {
    console.error("Error unlisting product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unlist product",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const productToDelete = await product.findById(productId);
    if (!productToDelete) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    productToDelete.isBlocked = true;
    await productToDelete.save();

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting product",
      error: error.message,
    });
  }
};

module.exports = {
  productInfo,
  getProductAddPage,
  processImages,
  addProducts,
  editProduct,
  productListed,
  productUnlisted,
  deleteProduct,
};
