const Brand = require("../../models/brandSchema");

const brandInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const query = search
      ? { isDeleted: false, name: { $regex: search, $options: "i" } }
      : { isDeleted: false };

    const brandData = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalBrands = await Brand.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit);

    res.render("brands", {
      brands: brandData,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      search,
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).send("Error loading brands");
  }
};

const addBrand = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingBrands = await Brand.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingBrands) {
      return res.status(400).json({
        success: false,
        message: "Brand already exists",
      });
    }

    const newBrands = new Brand({
      name,
      description,
      isListed: true,
    });

    await newBrands.save();

    return res.status(201).json({
      success: true,
      message: "Brand added successfully",
    });
  } catch (error) {
    console.error("Error in addBrand:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const brandlisted = async (req, res) => {
  try {
    const id = req.params.id;

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    await Brand.updateOne({ _id: id }, { $set: { isListed: true } });

    return res.status(200).json({
      success: true,
      message: "Brand listed successfully",
    });
  } catch (error) {
    console.error("Error in brandListed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list brand",
    });
  }
};

const brandunlisted = async (req, res) => {
  try {
    const id = req.params.id;

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    await Brand.updateOne({ _id: id }, { $set: { isListed: false } });

    return res.status(200).json({
      success: true,
      message: "Brand unlisted successfully",
    });
  } catch (error) {
    console.error("Error in brandUnlisted:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unlist brand",
    });
  }
};

const getEditBrand = async (req, res) => {
  try {
    const id = req.query.id;

    const brands = await Brand.findById(id);
    if (!brands) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    return res.status(200).json({
      success: true,
      brands,
    });
  } catch (error) {
    console.error("Error fetching brand for edit:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const editBrand = async (req, res) => {
  try {
    const { id, name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const existingBrands = await Brand.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: id },
    });

    if (existingBrands) {
      return res.status(400).json({
        success: false,
        message: "Another brand with this name already exists",
      });
    }

    await Brand.findByIdAndUpdate(id, { name, description });

    return res.status(200).json({
      success: true,
      message: "Brand updated successfully",
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const id = req.params.id;

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    await Brand.findByIdAndUpdate(id, { $set: { isDeleted: true } });

    return res.status(200).json({
      success: true,
      message: "Brand deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete brand",
    });
  }
};

module.exports = {
  brandInfo,
  addBrand,
  brandunlisted,
  brandlisted,
  getEditBrand,
  editBrand,
  deleteBrand,
};
