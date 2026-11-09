import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  baseUnit: { type: String, required: true, trim: true, lowercase: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

ingredientSchema.index({ name: 'text' });

export const Ingredient = mongoose.model('Ingredient', ingredientSchema);
