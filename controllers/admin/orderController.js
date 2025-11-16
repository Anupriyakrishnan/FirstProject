// const Order = require("../../models/orderSchema");
// const User = require("../../models/userSchema");
// const Product = require('../../models/productSchema');
// const Wallet = require('../../models/walletSchema');

// const orderInfo = async (req, res) => {
//   try {
//     const searchQuery = req.query.search || "";
//     const page = parseInt(req.query.page) || 1;
//     const ITEMS_PER_PAGE = 10;

//     const totalOrders = await Order.countDocuments();
//     let orders = await Order.find()
//       .populate("orderedItem.Product")
//       .populate("userId", "name")
//       .sort({ createOn: -1 })
//       .skip((page - 1) * ITEMS_PER_PAGE)
//       .limit(ITEMS_PER_PAGE)
//       .lean();

//     if (searchQuery) {
//       const regex = new RegExp(searchQuery, "i");
//       orders = orders.filter(
//         (order) => regex.test(order.orderId) || regex.test(order.userId?.name)
//       );
//     }

//     res.render("order", {  
//       orders,
//       currentPage: page,
//       hasNextPage: ITEMS_PER_PAGE * page < totalOrders,
//       hasPreviousPage: page > 1,
//       nextPage: page + 1,
//       previousPage: page - 1,
//       lastPage: Math.ceil(totalOrders / ITEMS_PER_PAGE)
//     });
//   } catch (error) {
//     console.error("Error in orderInfo:", error);
//     res.status(500).render("error", {
//       message: "Server error. Please try again.",
//       error: error.message,
//     });
//   }
// };

// const orderdetailsInfo = async (req, res) => {
//   try {
//     const orderId = req.query.id;
//     if (!orderId) {
//       return res.status(400).send("Order ID is required");
//     }

//     const order = await Order.findById(orderId)
//       .populate({
//         path: 'userId',
//         select: 'name email'
//       })
//       .populate('orderedItem.Product', 'productImage productName');

//     if (!order) {
//       return res.status(404).send("Order not found");
//     }

//     let cancelledTotal = 0;
//     let itemsTotal = 0;

//     order.orderedItem.forEach(item => {
//       itemsTotal += item.totalPrice * item.quantity;
//       if (item.status === 'returned' || item.status === 'cancelled') {
//         cancelledTotal += item.totalPrice * item.quantity;
//       }
//     });

//     order.payment = {
//       cancelled: cancelledTotal,
//       itemsTotal: itemsTotal,
//       grandTotal: itemsTotal - cancelledTotal
//     };

//     const cartItems = order.orderedItem.map(item => ({
//       _id: item._id,
//       Product: item.Product,
//       quantity: item.quantity,
//       price: item.price,
//       status: item.status,
//       returnReason: item.returnReason
//     }));

//     // Debug: Log cartItems and returnRequest
//     console.log('Order Return Request:', order.returnRequest);
//     console.log('Cart Items:', JSON.stringify(cartItems.map(item => ({ id: item._id, status: item.status, returnReason: item.returnReason })), null, 2));

//     // Fetch wallet balance
//     const wallet = await Wallet.findOne({ userId: order.userId });

//     res.render('order-details', { 
//       order,
//       cartItems,
//       user: order.userId,
//       walletBalance: wallet ? wallet.balance : 0
//     });
//   } catch (error) {
//     console.error("Error fetching order details:", error);
//     res.status(500).send("Server Error");
//   }
// };

// const updateOrderStatus = async (req, res) => {
//   const { orderId } = req.params;
//   const { status } = req.body;

//   try {
//     const order = await Order.findById(orderId);
//     if (!order) return res.status(404).json({ message: 'Order not found' });

//     order.status = status;
//     await order.save();

//     return res.status(200).json({ message: 'Order status updated successfully' });
//   } catch (error) {
//     console.error("Error updating order status:", error);
//     return res.status(500).json({ message: 'Server error' });
//   }
// };

// const handleReturnAction = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { itemId, itemIds, action } = req.body;

//     if (!action || !['accept', 'reject'].includes(action)) {
//       return res.status(400).json({ success: false, message: 'Invalid action provided.' });
//     }

//     // Load order and populate Products for inventory updates
//     const order = await Order.findById(orderId).populate('orderedItem.Product');
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found.' });
//     }

//     // Helpers to record results
//     const accepted = [];
//     const rejected = [];
//     let refundAmount = 0;

//     // Utility to restore inventory for a subitem (idempotent because we only call when status === 'returnrequest')
//     const restoreInventoryForItem = async (item) => {
//       if (!item) return;
//       const productId = item.Product && item.Product._id ? item.Product._id : item.Product;
//       if (!productId) return;
//       const productToUpdate = await Product.findById(productId);
//       if (productToUpdate) {
//         productToUpdate.quantity += item.quantity;
//         await productToUpdate.save();
//       } else {
//         console.warn(`Product with ID ${productId} not found for inventory update.`);
//       }
//     };

//     // Utility to credit wallet for a given amount, prevents duplicates by checking existing transactions
//     const creditWallet = async (userId, amount, description) => {
//       if (amount <= 0) return { credited: false, amount: 0, reason: 'Invalid amount' };

//       let wallet = await Wallet.findOne({ userId });
//       if (!wallet) {
//         wallet = new Wallet({
//           userId,
//           balance: 0,
//           transactions: []
//         });
//       }

//       // Prevent duplicate refund using description + amount + type
//       const alreadyCredited = wallet.transactions.some(
//         t => t.type === 'credit' && t.description === description && Number(t.amount) === Number(amount)
//       );

//       if (alreadyCredited) {
//         console.warn(`Duplicate refund prevented for description: ${description}`);
//         return { credited: false, amount: 0, reason: 'Already credited' };
//       }

//       // Push new transaction and update balance
//       wallet.transactions.push({
//         amount,
//         type: 'credit',
//         date: new Date(),
//         description
//       });
//       wallet.balance = Number(wallet.balance || 0) + Number(amount);

//       await wallet.save();
//       return { credited: true, amount, reason: 'Credited' };
//     };

//     // Helper to process single item acceptance (idempotent because it checks item.status === 'returnrequest')
//     const acceptSingleItem = async (item) => {
//       if (!item) return { credited: false, amount: 0, reason: 'Item missing' };
//       if (item.status !== 'returnrequest') {
//         return { credited: false, amount: 0, reason: `Item status is '${item.status}'` };
//       }

//       // Mark returned and restore inventory
//       item.status = 'returned';
//       await restoreInventoryForItem(item);

//       const amt = (item.price || 0) * (item.quantity || 0);
//       const desc = `Refund for returned item (Order ID: ${order.orderId}, Item ID: ${item._id})`;

//       const creditResult = await creditWallet(order.userId, amt, desc);
//       return creditResult;
//     };

//     // 1) Multiple items supplied (itemIds array)
//     if (Array.isArray(itemIds) && itemIds.length > 0) {
//       for (const id of itemIds) {
//         const item = order.orderedItem.id(id);
//         if (!item) {
//           rejected.push({ id, reason: 'Item not found in order.' });
//           continue;
//         }

//         if (action === 'accept') {
//           // Only accept if the item has a return request
//           if (item.status !== 'returnrequest') {
//             rejected.push({ id, reason: `Item status is '${item.status}', not 'returnrequest'` });
//             continue;
//           }

//           const result = await acceptSingleItem(item);
//           if (result.credited) {
//             refundAmount += Number(result.amount);
//             accepted.push({ id, refunded: result.amount });
//           } else {
//             // Even if not credited (duplicate), mark accepted but note it was already refunded
//             accepted.push({ id, refunded: 0, note: result.reason });
//           }
//         } else { // reject
//           if (item.status !== 'returnrequest') {
//             rejected.push({ id, reason: `Item status is '${item.status}', not 'returnrequest'` });
//             continue;
//           }
//           item.status = 'delivered';
//           item.returnReason = '';
//           rejected.push({ id, reason: 'Return request rejected' });
//         }
//       }

//       // no separate batch-crediting anymore: already credited per-item above

//     // 2) Single item supplied (itemId)
//     } else if (itemId) {
//       const item = order.orderedItem.id(itemId);
//       if (!item) {
//         return res.status(404).json({ success: false, message: 'Item not found in order.' });
//       }

//       if (action === 'accept') {
//         if (item.status !== 'returnrequest') {
//           return res.status(400).json({ success: false, message: 'No pending return request for this item.' });
//         }

//         const result = await acceptSingleItem(item);
//         if (result.credited) {
//           refundAmount = Number(result.amount);
//           accepted.push({ id: itemId, refunded: result.amount });
//         } else {
//           // If already refunded, still mark as accepted but refund 0 in response
//           accepted.push({ id: itemId, refunded: 0, note: result.reason });
//         }

//       } else { // reject
//         if (item.status !== 'returnrequest') {
//           return res.status(400).json({ success: false, message: 'No pending return request for this item.' });
//         }
//         item.status = 'delivered';
//         item.returnReason = '';
//         rejected.push({ id: itemId, reason: 'Return request rejected' });
//       }

//     // 3) No item specified -> treat as order-level action
//     } else {
//       // Accept order-level return only if order.status === 'returnrequest' OR at least one item has returnrequest
//       const orderHasReturnRequest = order.status === 'returnrequest' || order.orderedItem.some(i => i.status === 'returnrequest');
//       if (!orderHasReturnRequest) {
//         return res.status(400).json({ success: false, message: 'No pending order-level return request.' });
//       }

//       if (action === 'accept') {
//         // Mark order returned and process only items that have status === 'returnrequest'
//         // IMPORTANT: removed '|| true' so we do not process items that were not requested
//         for (const item of order.orderedItem) {
//           if (item.status === 'returnrequest') {
//             const result = await acceptSingleItem(item);
//             if (result.credited) {
//               refundAmount += Number(result.amount);
//               accepted.push({ id: item._id.toString(), refunded: result.amount });
//             } else {
//               accepted.push({ id: item._id.toString(), refunded: 0, note: result.reason });
//             }
//           }
//         }

//         // If all items were returned or cancelled, set order.status
//         const allItemsReturnedOrCancelled = order.orderedItem.every(i => ['returned','cancelled'].includes(i.status));
//         order.status = allItemsReturnedOrCancelled ? 'returned' : (order.orderedItem.some(i => i.status === 'returnrequest') ? 'returnrequest' : 'delivered');

//       } else { // reject order-level
//         order.status = 'delivered';
//         for (const item of order.orderedItem) {
//           if (item.status === 'returnrequest') {
//             item.status = 'delivered';
//             item.returnReason = '';
//             rejected.push({ id: item._id.toString(), reason: 'Order-level return rejected' });
//           }
//         }
//       }
//     }

//     // Recalculate payment totals
//     let cancelledTotal = 0;
//     let itemsTotal = 0;

//     order.orderedItem.forEach(i => {
//       itemsTotal += (i.price || 0) * (i.quantity || 0);
//       if (i.status === 'returned' || i.status === 'cancelled') {
//         cancelledTotal += (i.price || 0) * (i.quantity || 0);
//       }
//     });

//     order.payment = {
//       cancelled: cancelledTotal,
//       itemsTotal: itemsTotal,
//       grandTotal: itemsTotal - cancelledTotal
//     };

//     // Determine and update overall order.status after item-level changes
//     const allItemsFinalized = order.orderedItem.every(i => ['returned','cancelled','delivered'].includes(i.status));
//     const allItemsReturnedOrCancelled = order.orderedItem.every(i => ['returned','cancelled'].includes(i.status));
//     if (allItemsFinalized) {
//       order.status = allItemsReturnedOrCancelled ? 'returned' : 'delivered';
//     } else if (order.orderedItem.some(i => i.status === 'returnrequest')) {
//       order.status = 'returnrequest';
//     }

//     order.updatedAt = new Date();
//     await order.save();

//     return res.json({
//       success: true,
//       message: `Return request processed (${action}).`,
//       accepted,
//       rejected,
//       refundAmount
//     });

//   } catch (error) {
//     console.error("Error in handleReturnAction:", error);
//     return res.status(500).json({ success: false, message: "An error occurred while processing the return request." });
//   }
// };


// module.exports = {
//   orderInfo,
//   orderdetailsInfo,
//   updateOrderStatus,
//   handleReturnAction,
// };

const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');

const orderInfo = async (req, res) => {
  try {
    const searchQuery = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const ITEMS_PER_PAGE = 10;

    const totalOrders = await Order.countDocuments();
    let orders = await Order.find()
      .populate("orderedItem.Product")
      .populate("userId", "name")
      .sort({ createOn: -1 })
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .lean();

    if (searchQuery) {
      const regex = new RegExp(searchQuery, "i");
      orders = orders.filter(
        (order) => regex.test(order.orderId) || regex.test(order.userId?.name)
      );
    }

    res.render("order", {  
      orders,
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalOrders,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalOrders / ITEMS_PER_PAGE)
    });
  } catch (error) {
    console.error("Error in orderInfo:", error);
    res.status(500).render("error", {
      message: "Server error. Please try again.",
      error: error.message,
    });
  }
};

const orderdetailsInfo = async (req, res) => {
  try {
    const orderId = req.query.id;
    if (!orderId) {
      return res.status(400).send("Order ID is required");
    }

    const order = await Order.findById(orderId)
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .populate('orderedItem.Product', 'productImage productName');

    if (!order) {
      return res.status(404).send("Order not found");
    }

    // ✅ Calculate totals properly considering offers and coupons
    const subtotal = order.orderedItem.reduce((sum, item) => {
      // Use totalPrice which already has offer discounts applied
      const itemTotal = Number(item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1));
      return sum + itemTotal;
    }, 0);

    // Total coupon discount from the order
    const totalCouponDiscount = Number(order.couponDiscount || 0);

    // Calculate cancelled/returned amount
    let cancelledTotal = 0;
    order.orderedItem.forEach(item => {
      if (item.status === 'returned' || item.status === 'cancelled') {
        // Item's amount after offer discount
        const itemTotalAfterOffer = Number(item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1));
        
        // Calculate this item's proportional share of coupon discount
        let itemCouponShare = 0;
        if (totalCouponDiscount > 0 && subtotal > 0) {
          itemCouponShare = (itemTotalAfterOffer / subtotal) * totalCouponDiscount;
        }
        
        // Refunded amount = Item total after offer - coupon share
        const refundedAmount = itemTotalAfterOffer - itemCouponShare;
        cancelledTotal += refundedAmount;
      }
    });

    // ✅ Correct payment summary
    order.payment = {
      cancelled: Math.round(cancelledTotal * 100) / 100,
      itemsTotal: order.totalPrice, // Original total before any discounts
      subtotalAfterOffers: Math.round(subtotal * 100) / 100, // After offer discounts
      couponDiscount: totalCouponDiscount,
      finalAmount: order.finalAmount, // Final amount (should match order.finalAmount)
      payableAmount: Math.round((order.finalAmount - cancelledTotal) * 100) / 100
    };

    const cartItems = order.orderedItem.map(item => ({
      _id: item._id,
      Product: item.Product,
      quantity: item.quantity,
      price: item.price,
      discountedPrice: item.discountedPrice,
      totalPrice: item.totalPrice,
      status: item.status,
      returnReason: item.returnReason
    }));

    console.log('=== ORDER PAYMENT SUMMARY ===');
    console.log('Original Total:', order.totalPrice);
    console.log('After Offers:', subtotal);
    console.log('Coupon Discount:', totalCouponDiscount);
    console.log('Final Amount:', order.finalAmount);
    console.log('Cancelled/Returned:', cancelledTotal);
    console.log('Payable Amount:', order.payment.payableAmount);
    console.log('============================');

    // Fetch wallet balance
    const wallet = await Wallet.findOne({ userId: order.userId });

    res.render('order-details', { 
      order,
      cartItems,
      user: order.userId,
      walletBalance: wallet ? wallet.balance : 0
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).send("Server Error");
  }
};

const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    await order.save();

    return res.status(200).json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const handleReturnAction = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemId, itemIds, action } = req.body;

    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action provided.' });
    }

    const order = await Order.findById(orderId).populate('orderedItem.Product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const accepted = [];
    const rejected = [];
    let refundAmount = 0;

    // ✅ Calculate subtotal and coupon discount for proportional refund
    const subtotal = order.orderedItem.reduce((sum, item) => {
      const itemTotal = Number(item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1));
      return sum + itemTotal;
    }, 0);

    const totalCouponDiscount = Number(order.couponDiscount || 0);

    const restoreInventoryForItem = async (item) => {
      if (!item) return;
      const productId = item.Product && item.Product._id ? item.Product._id : item.Product;
      if (!productId) return;
      const productToUpdate = await Product.findById(productId);
      if (productToUpdate) {
        productToUpdate.quantity += item.quantity;
        await productToUpdate.save();
      }
    };

    const creditWallet = async (userId, amount, description) => {
      if (amount <= 0) return { credited: false, amount: 0, reason: 'Invalid amount' };

      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          balance: 0,
          transactions: []
        });
      }

      const alreadyCredited = wallet.transactions.some(
        t => t.type === 'credit' && t.description === description && Number(t.amount) === Number(amount)
      );

      if (alreadyCredited) {
        console.warn(`Duplicate refund prevented for description: ${description}`);
        return { credited: false, amount: 0, reason: 'Already credited' };
      }

      wallet.transactions.push({
        amount,
        type: 'credit',
        date: new Date(),
        description
      });
      wallet.balance = Number(wallet.balance || 0) + Number(amount);

      await wallet.save();
      return { credited: true, amount, reason: 'Credited' };
    };

    // ✅ Calculate correct refund amount considering offers and coupons
    const calculateRefundAmount = (item) => {
      // Item's total after offer discount
      const itemTotalAfterOffer = Number(item.totalPrice ?? (item.discountedPrice ?? item.price) * (item.quantity ?? 1));
      
      // Calculate proportional coupon share
      let itemCouponShare = 0;
      if (totalCouponDiscount > 0 && subtotal > 0) {
        itemCouponShare = (itemTotalAfterOffer / subtotal) * totalCouponDiscount;
      }
      
      // Refund = Item total after offer - coupon share
      const refund = itemTotalAfterOffer - itemCouponShare;
      return Math.round(refund * 100) / 100;
    };

    const acceptSingleItem = async (item) => {
      if (!item) return { credited: false, amount: 0, reason: 'Item missing' };
      if (item.status !== 'returnrequest') {
        return { credited: false, amount: 0, reason: `Item status is '${item.status}'` };
      }

      item.status = 'returned';
      await restoreInventoryForItem(item);

      // ✅ Use corrected refund calculation
      const amt = calculateRefundAmount(item);
      const desc = `Refund for returned item (Order ID: ${order.orderId}, Item ID: ${item._id})`;

      const creditResult = await creditWallet(order.userId, amt, desc);
      return creditResult;
    };

    // Process multiple items
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      for (const id of itemIds) {
        const item = order.orderedItem.id(id);
        if (!item) {
          rejected.push({ id, reason: 'Item not found in order.' });
          continue;
        }

        if (action === 'accept') {
          if (item.status !== 'returnrequest') {
            rejected.push({ id, reason: `Item status is '${item.status}', not 'returnrequest'` });
            continue;
          }

          const result = await acceptSingleItem(item);
          if (result.credited) {
            refundAmount += Number(result.amount);
            accepted.push({ id, refunded: result.amount });
          } else {
            accepted.push({ id, refunded: 0, note: result.reason });
          }
        } else {
          if (item.status !== 'returnrequest') {
            rejected.push({ id, reason: `Item status is '${item.status}', not 'returnrequest'` });
            continue;
          }
          item.status = 'delivered';
          item.returnReason = '';
          rejected.push({ id, reason: 'Return request rejected' });
        }
      }
    } 
    // Process single item
    else if (itemId) {
      const item = order.orderedItem.id(itemId);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found in order.' });
      }

      if (action === 'accept') {
        if (item.status !== 'returnrequest') {
          return res.status(400).json({ success: false, message: 'No pending return request for this item.' });
        }

        const result = await acceptSingleItem(item);
        if (result.credited) {
          refundAmount = Number(result.amount);
          accepted.push({ id: itemId, refunded: result.amount });
        } else {
          accepted.push({ id: itemId, refunded: 0, note: result.reason });
        }
      } else {
        if (item.status !== 'returnrequest') {
          return res.status(400).json({ success: false, message: 'No pending return request for this item.' });
        }
        item.status = 'delivered';
        item.returnReason = '';
        rejected.push({ id: itemId, reason: 'Return request rejected' });
      }
    } 
    // Process order-level return
    else {
      const orderHasReturnRequest = order.status === 'returnrequest' || order.orderedItem.some(i => i.status === 'returnrequest');
      if (!orderHasReturnRequest) {
        return res.status(400).json({ success: false, message: 'No pending order-level return request.' });
      }

      if (action === 'accept') {
        for (const item of order.orderedItem) {
          if (item.status === 'returnrequest') {
            const result = await acceptSingleItem(item);
            if (result.credited) {
              refundAmount += Number(result.amount);
              accepted.push({ id: item._id.toString(), refunded: result.amount });
            } else {
              accepted.push({ id: item._id.toString(), refunded: 0, note: result.reason });
            }
          }
        }

        const allItemsReturnedOrCancelled = order.orderedItem.every(i => ['returned','cancelled'].includes(i.status));
        order.status = allItemsReturnedOrCancelled ? 'returned' : (order.orderedItem.some(i => i.status === 'returnrequest') ? 'returnrequest' : 'delivered');
      } else {
        order.status = 'delivered';
        for (const item of order.orderedItem) {
          if (item.status === 'returnrequest') {
            item.status = 'delivered';
            item.returnReason = '';
            rejected.push({ id: item._id.toString(), reason: 'Order-level return rejected' });
          }
        }
      }
    }

    // ✅ Recalculate payment totals with correct logic
    let cancelledTotal = 0;
    order.orderedItem.forEach(item => {
      if (item.status === 'returned' || item.status === 'cancelled') {
        cancelledTotal += calculateRefundAmount(item);
      }
    });

    order.payment = {
      cancelled: Math.round(cancelledTotal * 100) / 100,
      itemsTotal: order.totalPrice,
      grandTotal: Math.round((order.finalAmount - cancelledTotal) * 100) / 100
    };

    const allItemsFinalized = order.orderedItem.every(i => ['returned','cancelled','delivered'].includes(i.status));
    const allItemsReturnedOrCancelled = order.orderedItem.every(i => ['returned','cancelled'].includes(i.status));
    if (allItemsFinalized) {
      order.status = allItemsReturnedOrCancelled ? 'returned' : 'delivered';
    } else if (order.orderedItem.some(i => i.status === 'returnrequest')) {
      order.status = 'returnrequest';
    }

    order.updatedAt = new Date();
    await order.save();

    console.log(`✅ Return processed: Refunded ₹${refundAmount}`);

    return res.json({
      success: true,
      message: `Return request processed (${action}).`,
      accepted,
      rejected,
      refundAmount
    });

  } catch (error) {
    console.error("Error in handleReturnAction:", error);
    return res.status(500).json({ success: false, message: "An error occurred while processing the return request." });
  }
};

module.exports = {
  orderInfo,
  orderdetailsInfo,
  updateOrderStatus,
  handleReturnAction,
};