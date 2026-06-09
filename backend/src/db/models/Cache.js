/**
 * Cache Model - Stores snapshots for offline viewing
 */

const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['CANDLES', 'MARKET_DATA', 'ANALYSIS', 'TRADES', 'FULL_STATE'],
  },
  symbol: String,
  data: mongoose.Schema.Types.Mixed,
  expiresAt: {
    type: Date,
    index: true,
  }
}, {
  timestamps: true,
  collection: 'cache'
});

// TTL index - automatically delete expired cache entries
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to set cache
cacheSchema.statics.setCache = async function(key, type, data, ttlSeconds = 3600) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  
  return await this.findOneAndUpdate(
    { key },
    { 
      $set: { 
        key, 
        type, 
        data, 
        expiresAt 
      } 
    },
    { upsert: true, new: true }
  );
};

// Static method to get cache
cacheSchema.statics.getCache = async function(key) {
  const cached = await this.findOne({ 
    key, 
    expiresAt: { $gt: new Date() } 
  }).lean();
  
  return cached ? cached.data : null;
};

// Static method to clear expired cache
cacheSchema.statics.clearExpired = async function() {
  return await this.deleteMany({ 
    expiresAt: { $lt: new Date() } 
  });
};

module.exports = mongoose.model('Cache', cacheSchema);
