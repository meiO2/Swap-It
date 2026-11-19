import { calculatePrasmulBasicPrice } from "./lib/prasmul";

const targetAmount = 123000;

const result = calculatePrasmulBasicPrice(targetAmount);

console.log("SWAPIT CHECKOUT:", targetAmount);
console.log("PRASMUL CALCULATION:");
console.table([result]);

console.log("AMOUNT MATCH:", result.estimatedAmount === targetAmount);
