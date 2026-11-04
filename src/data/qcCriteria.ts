export type QCCriterion = {
  id: string;
  label: string;
  options: Array<{ id: string; label: string }>;
};

// TODO(spec): Replace each empty set with criteria and option labels from the
// approved SwapIt product-detail specification. No source was included.
export const qcCriteriaByCategory: Record<string, QCCriterion[]> = {
  Tops: [],
  Bottoms: [],
  Dresses: [],
  Outerwear: [],
  Accessories: [],
  Shoes: [],
  default: [],
};
