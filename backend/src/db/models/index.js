/**
 * Database Models Index
 * Central export point for all models
 */

const Candle = require('./Candle');
const MarketData = require('./MarketData');
const Signal = require('./Signal');
const Trade = require('./Trade');
const Cache = require('./Cache');

module.exports = {
  Candle,
  MarketData,
  Signal,
  Trade,
  Cache,
};
