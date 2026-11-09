import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { Ingredient } from './models/Ingredient.js';
import { Item } from './models/Item.js';
import { Order } from './models/Order.js';
import { redis } from './db.js';
import { handleError, notFound, requireOwner, requireUser } from './middleware.js';

const app = express();
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mongo: mongoose.connection.readyState === 1, redis: redis.isReady });
});

app.get('/api/items', async (req, res) => {
  const filter = { active: true };
  if (req.query.search) filter.$text = { $search: String(req.query.search) };
  const items = await Item.find(filter).populate('ingredients.ingredient', 'name baseUnit description').sort({ createdAt: -1 });
  res.json({ items });
});

app.get('/api/items/:id', async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, active: true })
    .populate('ingredients.ingredient', 'name baseUnit description');
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

app.get('/api/ingredients', async (req, res) => {
  const ingredients = await Ingredient.find({ active: true }).sort({ name: 1 });
  res.json({ ingredients });
});

app.get('/api/owner/ingredients', requireOwner, async (req, res) => {
  const ingredients = await Ingredient.find().sort({ name: 1 });
  res.json({ ingredients });
});

app.post('/api/owner/ingredients', requireOwner, async (req, res) => {
  const ingredient = await Ingredient.create(req.body);
  res.status(201).json({ ingredient });
});

app.patch('/api/owner/ingredients/:id', requireOwner, async (req, res) => {
  const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!ingredient) return res.status(404).json({ error: 'Ingredient not found' });
  res.json({ ingredient });
});

app.delete('/api/owner/ingredients/:id', requireOwner, async (req, res) => {
  const isUsed = await Item.exists({ 'ingredients.ingredient': req.params.id, active: true });
  if (isUsed) return res.status(409).json({ error: 'Ingredient is used by an active item; update or deactivate the item first' });
  const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!ingredient) return res.status(404).json({ error: 'Ingredient not found' });
  res.json({ ingredient });
});

app.post('/api/owner/items', requireOwner, async (req, res) => {
  const invalidReference = await findUnavailableIngredient(req.body.ingredients);
  if (invalidReference) return res.status(400).json({ error: `Ingredient is missing or inactive: ${invalidReference}` });
  const item = await Item.create(req.body);
  res.status(201).json({ item: await item.populate('ingredients.ingredient', 'name baseUnit') });
});

app.get('/api/owner/items', requireOwner, async (req, res) => {
  const items = await Item.find().populate('ingredients.ingredient', 'name baseUnit active').sort({ createdAt: -1 });
  res.json({ items });
});

app.patch('/api/owner/items/:id', requireOwner, async (req, res) => {
  if (req.body.ingredients) {
    const invalidReference = await findUnavailableIngredient(req.body.ingredients);
    if (invalidReference) return res.status(400).json({ error: `Ingredient is missing or inactive: ${invalidReference}` });
  }
  const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('ingredients.ingredient', 'name baseUnit');
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

app.delete('/api/owner/items/:id', requireOwner, async (req, res) => {
  const item = await Item.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

app.get('/api/cart', requireUser, async (req, res) => {
  const quantities = await redis.hGetAll(cartKey(req.userId));
  res.json({ userId: req.userId, items: Object.entries(quantities).map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) })) });
});

app.post('/api/cart/items', requireUser, async (req, res) => {
  const { itemId, quantity = 1 } = req.body;
  if (!mongoose.isValidObjectId(itemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'itemId must be valid and quantity must be an integer from 1 to 99' });
  }
  const itemExists = await Item.exists({ _id: itemId, active: true });
  if (!itemExists) return res.status(404).json({ error: 'Item not found' });
  const cart = cartKey(req.userId);
  const nextQuantity = await redis.hIncrBy(cart, itemId, quantity);
  await redis.expire(cart, 60 * 60 * 24 * 7);
  res.status(200).json({ itemId, quantity: nextQuantity });
});

app.delete('/api/cart/items/:itemId', requireUser, async (req, res) => {
  await redis.hDel(cartKey(req.userId), req.params.itemId);
  res.status(204).end();
});

app.delete('/api/cart', requireUser, async (req, res) => {
  await redis.del(cartKey(req.userId));
  res.status(204).end();
});

app.post('/api/orders', requireUser, async (req, res) => {
  const cartKeyForUser = cartKey(req.userId);
  const cart = await redis.hGetAll(cartKeyForUser);
  const entries = Object.entries(cart);
  if (!entries.length) return res.status(400).json({ error: 'Cart is empty' });

  const ids = entries.map(([id]) => id);
  const items = await Item.find({ _id: { $in: ids }, active: true }).populate('ingredients.ingredient', 'name');
  if (items.length !== entries.length) return res.status(409).json({ error: 'One or more cart items are no longer available' });

  const byId = new Map(items.map((item) => [String(item._id), item]));
  const orderItems = entries.map(([id, count]) => {
    const item = byId.get(id);
    const quantity = Number(count);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Cart contains an invalid quantity');
    return {
      itemId: item._id,
      name: item.name,
      quantity,
      unitPrice: item.price,
      ingredients: item.ingredients.map((entry) => ({
        name: entry.ingredient.name,
        amount: entry.amount,
        unit: entry.unit,
        packaging: entry.packaging,
      })),
    };
  });

  const order = await Order.create({
    userId: req.userId,
    items: orderItems,
    total: orderItems.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0),
  });

  const expected = entries.flatMap(([id, quantity]) => [id, quantity]);
  await redis.eval(
    "if redis.call('HLEN', KEYS[1]) ~= (#ARGV / 2) then return 0 end for i = 1, #ARGV, 2 do if redis.call('HGET', KEYS[1], ARGV[i]) ~= ARGV[i + 1] then return 0 end end return redis.call('DEL', KEYS[1])",
    { keys: [cartKeyForUser], arguments: expected },
  );

  res.status(201).json({ order });
});

app.get('/api/orders/:id', requireUser, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.userId });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

app.use(notFound);
app.use(handleError);

function cartKey(userId) {
  return `cart:${userId}`;
}

async function findUnavailableIngredient(recipe) {
  if (!Array.isArray(recipe)) return null;
  for (const entry of recipe) {
    if (!mongoose.isValidObjectId(entry.ingredient)) return entry.ingredient;
  }
  const ids = recipe.map((entry) => entry.ingredient);
  const count = await Ingredient.countDocuments({ _id: { $in: ids }, active: true });
  return count === new Set(ids.map(String)).size ? null : 'one or more supplied IDs';
}

export default app;
