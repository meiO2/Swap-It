const targetAmount = 103000;

// Tarif berdasarkan response PRASMUL yang sudah kita lihat
const adminFeeRate = 0.007;
const ppnRate = 0.11;
const processingFee = 4000;
const ppnProcessingFee = 400;
const platformFee = 1500;

function calculatePrasmulAmount(basicPrice: number) {
  const adminFee = basicPrice * adminFeeRate;
  const ppnAdminFee = adminFee * ppnRate;

  const total =
    basicPrice +
    adminFee +
    ppnAdminFee +
    processingFee +
    ppnProcessingFee +
    platformFee;

  return {
    basicPrice,
    adminFee,
    ppnAdminFee,
    processingFee,
    ppnProcessingFee,
    platformFee,
    estimatedAmount: Math.round(total),
  };
}

// Cari basic_price yang menghasilkan amount tepat Rp103.000
const candidates = [];

for (let basicPrice = 1; basicPrice <= targetAmount; basicPrice++) {
  const result = calculatePrasmulAmount(basicPrice);

  if (result.estimatedAmount === targetAmount) {
    candidates.push(result);
  }
}

console.log("TARGET QRIS:", targetAmount);
console.log("KANDIDAT BASIC PRICE:");

console.table(candidates);
