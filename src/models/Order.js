import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  status: { type: String, enum: ['placed', 'preparing', 'shipped', 'delivered', 'cancelled'], default: 'placed' },
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    ingredients: [{
      name: { type: String, required: true },
      amount: { type: Number, required: true },
      unit: { type: String, required: true },
      packaging: { type: String, default: '' },
    }],
  }],
  total: { type: Number, required: true, min: 0 },
}, { timestamps: true });

export const Order = mongoose.model('Order', orderSchema);
