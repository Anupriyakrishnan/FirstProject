const User = require("../../models/userSchema");

const customerInfo = async (req, res) => {
  try {
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }
    let page = 1;
    if (req.query.page) {
      page = req.query.page;
    }
    const limit = 6;
    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    }).countDocuments();

    res.render("customers", {
      data: userData,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      search,
    });
  } catch (error) {}
};

const customerBlocked = async (req, res) => {
  try {
    let id = req.params.id;
    await User.findOneAndUpdate({ _id: id }, { $set: { isBlocked: true } });
    res.json({ success: true });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const customerunBlocked = async (req, res) => {
  try {
    let id = req.params.id;
    await User.findOneAndUpdate({ _id: id }, { $set: { isBlocked: false } });
    res.json({ success: true });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};
