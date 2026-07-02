(function () {
	function calculateCamarilla(previousDay = {}) {
		const high = Number(previousDay.high);
		const low = Number(previousDay.low);
		const close = Number(previousDay.close);

		if (![high, low, close].every(Number.isFinite)) {
			return { H3: null, H4: null, H5: null, L3: null, L4: null, L5: null };
		}

		const range = high - low;
		const multiplier = range * 1.1;

		return {
			H3: round(close + multiplier / 4),
			H4: round(close + multiplier / 2),
			H5: round((high / low) * close),
			L3: round(close - multiplier / 4),
			L4: round(close - multiplier / 2),
			L5: round(close - (multiplier * 1.1) / 2),
		};
	}

	function round(val) {
		return Math.round(val * 100) / 100;
	}

	module.exports = { calculateCamarilla };
})();
