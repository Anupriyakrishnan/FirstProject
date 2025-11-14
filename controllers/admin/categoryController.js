const Category = require("../../models/categorySchema");

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const query = search
      ? { isDeleted: false, name: { $regex: search, $options: "i" } }
      : { isDeleted: false };

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).render("error", { message: "Error loading categories" });
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const newCategory = new Category({
      name,
      description,
      isListed: true,
    });

    await newCategory.save();

    return res.status(201).json({
      success: true,
      message: "Category added successfully",
    });
  } catch (error) {
    console.error("Error in addCategory:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const categorylisted = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await Category.updateOne({ _id: id }, { $set: { isListed: true } });

    return res.status(200).json({
      success: true,
      message: "Category listed successfully",
    });
  } catch (error) {
    console.error("Error in categoryListed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list category",
    });
  }
};

const categoryunlisted = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await Category.updateOne({ _id: id }, { $set: { isListed: false } });

    return res.status(200).json({
      success: true,
      message: "Category unlisted successfully",
    });
  } catch (error) {
    console.error("Error in categoryunlisted:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unlist category",
    });
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("Error fetching category for edit:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const editCategory = async (req, res) => {
  try {
    const { id, name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Another category with this name already exists",
      });
    }

    await Category.findByIdAndUpdate(id, { name, description });

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await Category.findByIdAndUpdate(id, { $set: { isDeleted: true } });

    

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete category",
    });
  }
};



module.exports = {
  categoryInfo,
  addCategory,
  categoryunlisted,
  categorylisted,
  getEditCategory,
  editCategory,
  deleteCategory,
};
