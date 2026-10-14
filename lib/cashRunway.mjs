export function estimateRunway({ balance, dailyNetOutflow, overdueBalance = 0, purchaseAmount = 0, today = new Date() }) {
  const currentBalance = Number(balance);
  const dailyOutflow = Number(dailyNetOutflow);
  const overdue = Math.max(0, Number(overdueBalance) || 0);
  const purchase = Math.max(0, Number(purchaseAmount) || 0);

  function depletesOn(availableBalance) {
    if (availableBalance <= 0) return new Date(today);
    if (dailyOutflow <= 0) return null;

    const depletionDate = new Date(today);
    depletionDate.setDate(depletionDate.getDate() + Math.ceil(availableBalance / dailyOutflow));
    return depletionDate;
  }

  return {
    dailyNetOutflow: dailyOutflow,
    depletionDate: depletesOn(currentBalance),
    afterOverdueCollectionDate: depletesOn(currentBalance + overdue),
    afterPurchaseDate: depletesOn(currentBalance - purchase),
    balanceAfterPurchase: currentBalance - purchase,
  };
}

export function estimateStockRunout(products, sales, lookbackDays = 60) {
  const soldByProduct = new Map();
  for (const sale of sales || []) {
    if (!sale.product_id) continue;
    soldByProduct.set(
      sale.product_id,
      (soldByProduct.get(sale.product_id) || 0) + Number(sale.quantity || 0)
    );
  }

  return (products || [])
    .map((product) => {
      const quantitySold = soldByProduct.get(product.id) || 0;
      const dailyVelocity = quantitySold / lookbackDays;
      return {
        ...product,
        dailyVelocity,
        daysUntilStockout: dailyVelocity > 0
          ? Math.ceil(Number(product.quantity || 0) / dailyVelocity)
          : null,
        estimatedReorderCost: Math.max(
          0,
          (Number(product.low_stock_threshold || 0) * 2 - Number(product.quantity || 0))
            * Number(product.cost_price || 0)
        ),
      };
    })
    .filter((product) => product.daysUntilStockout != null)
    .sort((left, right) => left.daysUntilStockout - right.daysUntilStockout);
}