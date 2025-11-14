const Order = require("../../models/orderSchema");
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const getSalesReport = async (req, res) => {
  try {
    const { range, startDate, endDate, sortBy = 'createOn', sortOrder = 'desc' } = req.query;
    let filter = {};

    // Set date range based on filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === "daily") {
      filter.createOn = {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lte: new Date(today.setHours(23, 59, 59, 999)),
      };
    } else if (range === "weekly") {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(end.getDate() - 6);
      filter.createOn = { $gte: start, $lte: end };
    } else if (range === "monthly") {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(1);
      filter.createOn = { $gte: start, $lte: end };
    } else if (startDate && endDate) {
      filter.createOn = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Fetch orders based on the filter and sort
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const filteredData = await Order.find(filter).sort(sortOptions).lean();

    // Calculate summary metrics
    const summary = {
      grossSales: filteredData.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      cancelledOrReturned: filteredData.reduce((sum, order) => {
        if (order.status === 'cancelled' || order.status === 'returned') {
          return sum + (order.finalAmount || 0);
        }
        return sum;
      }, 0),
      discounts: filteredData.reduce((sum, order) => sum + (order.discount || 0), 0),
      netSales: filteredData.reduce((sum, order) => {
        if (order.status !== 'cancelled' && order.status !== 'returned') {
          return sum + (order.finalAmount || 0);
        }
        return sum;
      }, 0),
      totalOrders: filteredData.length,
    };

    res.render('sales-report', {
      summary,
      orders: filteredData,
      range,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    });
  } catch (error) {
    console.error("Error in getSalesReport:", error);
    res.redirect("/pageerror");
  }
};

const downloadReport = async (req, res) => {
  try {
    const { format, range, startDate, endDate, sortBy = 'createOn', sortOrder = 'desc' } = req.query;
    let filter = {};

    // Set date range based on filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === "daily") {
      filter.createOn = {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lte: new Date(today.setHours(23, 59, 59, 999)),
      };
    } else if (range === "weekly") {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(end.getDate() - 6);
      filter.createOn = { $gte: start, $lte: end };
    } else if (range === "monthly") {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(1);
      filter.createOn = { $gte: start, $lte: end };
    } else if (startDate && endDate) {
      filter.createOn = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Log filter for debugging
    console.log("Download Filter:", filter);

    // Fetch orders based on the filter and sort
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const filteredData = await Order.find(filter)
      .populate('orderedItem.Product', 'productName') // Populate product details
      .sort(sortOptions)
      .lean();

    // Log filtered data length for debugging
    console.log("Filtered Data Length:", filteredData.length);

    // Calculate summary metrics
    const summary = {
      grossSales: filteredData.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      cancelledOrReturned: filteredData.reduce((sum, order) => {
        if (order.status === 'cancelled' || order.status === 'returned') {
          return sum + (order.finalAmount || 0);
        }
        return sum;
      }, 0),
      discounts: filteredData.reduce((sum, order) => sum + (order.discount || 0), 0),
      netSales: filteredData.reduce((sum, order) => {
        if (order.status !== 'cancelled' && order.status !== 'returned') {
          return sum + (order.finalAmount || 0);
        }
        return sum;
      }, 0),
      totalOrders: filteredData.length,
    };

    if (format === 'pdf') {
      // Generate PDF
      const doc = new PDFDocument({ margin: 30 });
      const filename = `sales-report-${Date.now()}.pdf`;

      // Set response headers to open PDF in browser
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/pdf');

      doc.pipe(res);

      // Add title
      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();

      // Add summary
      doc.fontSize(14).text('Sales Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Gross Sales: RS ${summary.grossSales.toLocaleString('en-IN')}`);
      doc.text(`Cancelled or Returned: RS ${summary.cancelledOrReturned.toLocaleString('en-IN')}`);
      doc.text(`Discounts: RS ${summary.discounts.toLocaleString('en-IN')}`);
      doc.text(`Net Sales: RS ${summary.netSales.toLocaleString('en-IN')}`);
      doc.text(`Total Orders: ${summary.totalOrders}`);
      doc.moveDown(2);

      // Add table headers
      let tableTop = doc.y;
      const colWidths = [100, 80, 80, 80, 100, 80];
      const headers = ['Order ID', 'Total Price', 'Discount', 'Final Amount', 'Date', 'Status'];

      let xPos = 30;
      doc.fontSize(10).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, xPos, tableTop, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      });

      // Add table rows
      doc.font('Helvetica');
      let yPos = tableTop + 20;
      filteredData.forEach(order => {
        xPos = 30;
        const row = [
          order.orderId || 'N/A',
          `RS${(order.totalPrice || 0).toLocaleString('en-IN')}`,
          `RS${(order.discount || 0).toLocaleString('en-IN')}`,
          `RS${(order.finalAmount || 0).toLocaleString('en-IN')}`,
          order.createOn ? new Date(order.createOn).toLocaleDateString('en-IN') : 'N/A',
          order.status || '—',
        ];

        row.forEach((cell, i) => {
          doc.text(cell, xPos, yPos, { width: colWidths[i], align: 'left' });
          xPos += colWidths[i];
        });
        yPos += 20;

        // Add order items
        // doc.moveDown(0.5);
        // doc.fontSize(10).text(`Items for Order ${order.orderId}:`, xPos - colWidths.reduce((a, b) => a + b, 0), yPos);
        // yPos += 15;
        // order.orderedItem.forEach(item => {
        //   xPos = 30;
        //   const itemRow = [
        //     item.Product?.productName || 'N/A',
        //     item.quantity?.toString() || '0',
        //     `₹${(item.price || 0).toLocaleString('en-IN')}`,
        //     `₹${(item.discountedPrice || item.price || 0).toLocaleString('en-IN')}`,
        //     item.status || '—',
        //   ];
        //   itemRow.forEach((cell, i) => {
        //     doc.text(cell, xPos, yPos, { width: colWidths[i % colWidths.length], align: 'left' });
        //     xPos += colWidths[i % colWidths.length];
        //   });
        //   yPos += 15;
        // });
        // yPos += 10;

        // Add a new page if necessary
        if (yPos > 700) {
          doc.addPage();
          yPos = 30;
          xPos = 30;
          doc.fontSize(10).font('Helvetica-Bold');
          headers.forEach((header, i) => {
            doc.text(header, xPos, yPos, { width: colWidths[i], align: 'left' });
            xPos += colWidths[i];
          });
          yPos += 20;
          doc.font('Helvetica');
        }
      });

      // Finalize PDF
      doc.end();
    } else if (format === 'excel') {
  // Combine everything into one worksheet
  const worksheetData = [];

  // Add report title
  worksheetData.push(['Sales Report']);
  worksheetData.push([]);

  // Add summary section (like PDF)
  worksheetData.push(['Sales Summary']);
  worksheetData.push(['Gross Sales', `RS ${summary.grossSales.toLocaleString('en-IN')}`]);
  worksheetData.push(['Cancelled or Returned', `RS ${summary.cancelledOrReturned.toLocaleString('en-IN')}`]);
  worksheetData.push(['Discounts', `RS ${summary.discounts.toLocaleString('en-IN')}`]);
  worksheetData.push(['Net Sales', `RS ${summary.netSales.toLocaleString('en-IN')}`]);
  worksheetData.push(['Total Orders', summary.totalOrders]);
  worksheetData.push([]);

  // Add table headers (same as PDF)
  worksheetData.push(['Order ID', 'Total Price', 'Discount', 'Final Amount', 'Date', 'Status']);

  // Add each order
  filteredData.forEach(order => {
    worksheetData.push([
      order.orderId || 'N/A',
      `RS${(order.totalPrice || 0).toLocaleString('en-IN')}`,
      `RS${(order.discount || 0).toLocaleString('en-IN')}`,
      `RS${(order.finalAmount || 0).toLocaleString('en-IN')}`,
      order.createOn ? new Date(order.createOn).toLocaleDateString('en-IN') : 'N/A',
      order.status || '—',
    ]);

    // Add each order’s items below (optional like PDF)
    order.orderedItem.forEach(item => {
      worksheetData.push([
        '', // Empty to indent
        `Product: ${item.Product?.productName || 'N/A'}`,
        `Qty: ${item.quantity || 0}`,
        `Price: ₹${(item.price || 0).toLocaleString('en-IN')}`,
        `Final: ₹${(item.discountedPrice || item.price || 0).toLocaleString('en-IN')}`,
        `Item Status: ${item.status || '—'}`,
      ]);
    });

    worksheetData.push([]); // Add a blank row between orders
  });

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Report');

  const filename = `sales-report-${Date.now()}.xlsx`;

  // Set response headers for download
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.send(buffer);
  

    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (error) {
    console.error("Error in downloadReport:", error);
    res.status(500).json({ error: 'Error generating report' });
  }
};

module.exports = {
  getSalesReport,
  downloadReport,
};