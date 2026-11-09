import mongoose from 'mongoose';

const recipeIngredientSchema = new mongoose.Schema({
  ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  amount: { type: Number, required: true, min: 0.001 },
  unit: { type: String, required: true, trim: true, lowercase: true },
  packaging: { type: String, trim: true, default: '' },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  price: { type: Number, required: true, min: 0 },
  servings: { type: Number, required: true, min: 1, default: 2 },
  ingredients: { type: [recipeIngredientSchema], validate: (list) => list.length > 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

itemSchema.index({ name: 'text' });
itemSchema.index({ active: 1, createdAt: -1 });

export const Item = mongoose.model('Item', itemSchema);
