const Product = require('../models/Product');
const { asyncHandler } = require('../middleware/errorHandler');

exports.getProducts = asyncHandler(async (req, res) => {
  const reqQuery = { ...req.query };
  const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
  removeFields.forEach(param => delete reqQuery[param]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
  let queryConditions = JSON.parse(queryStr);

  if (req.query.search) {
    queryConditions.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { sku: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  let query = Product.find(queryConditions);

  if (req.query.select) {
    query = query.select(req.query.select.split(',').join(' '));
  }

  if (req.query.sort) {
    query = query.sort(req.query.sort.split(',').join(' '));
  } else {
    query = query.sort('-createdAt');
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const total = await Product.countDocuments(queryConditions);

  query = query.skip(startIndex).limit(limit);
  const products = await query;
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({ total, page, totalPages, count: products.length, products });
});

exports.getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  res.status(200).json(product);
});

exports.createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

exports.updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json(product);
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  await product.deleteOne();
  res.status(200).json({ message: 'Product deleted', id: req.params.id });
});

exports.updateStock = asyncHandler(async (req, res) => {
  const { change } = req.body;
  if (typeof change !== 'number') {
    return res.status(400).json({ success: false, error: 'Change value must be a number' });
  }

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  const newQuantity = product.quantity + change;
  if (newQuantity < 0) {
    return res.status(400).json({ success: false, error: 'Insufficient stock available' });
  }

  product.quantity = newQuantity;
  await product.save();

  res.status(200).json({ message: 'Stock updated', product });
});

exports.getLowStockReport = asyncHandler(async (req, res) => {
  const lowStockItems = await Product.find({
    $expr: { $lte: ['$quantity', '$reorderLevel'] }
  });

  res.status(200).json({ count: lowStockItems.length, lowStockItems });
});

exports.getCategorySummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' }
      }
    },
    { $sort: { totalStockValue: -1 } }
  ]);

  res.status(200).json({ categories: summary.length, summary });
});