export type QCCriterion = {
  id: string;
  label: string;
  options: Array<{ id: string; label: string }>;
};

const options = [
  { id: "good", label: "No issue" },
  { id: "minor", label: "Minor issue" },
  { id: "major", label: "Major issue" },
];

const criterion = (id: string, label: string): QCCriterion => ({
  id,
  label,
  options,
});

// Criteria shared by most clothing categories
const clothingCriteria: QCCriterion[] = [
  criterion("holes_tears", "Holes, tears, and fabric damage"),
  criterion("stains_marks", "Stains, paint marks, and discoloration"),
  criterion("color_condition", "Color fading and uneven color"),
  criterion("fabric_condition", "Fabric condition, pilling, and thinning"),
  criterion("stitching", "Stitching, seams, and loose threads"),
  criterion("odor_hygiene", "Cleanliness and unpleasant odor"),
  criterion("shape_condition", "Shape, fit, and overall appearance"),
];

// Additional checks for items with fasteners
const fastenerCriteria: QCCriterion[] = [
  criterion("fasteners", "Zippers, buttons, and closures"),
];

// Additional checks for accessories
const accessoryCriteria: QCCriterion[] = [
  criterion("surface_damage", "Scratches and surface damage"),
  criterion("hardware", "Clasps, buckles, straps, and other hardware"),
  criterion("structural_condition", "Structural integrity and functionality"),
  criterion("odor_hygiene", "Cleanliness and unpleasant odor"),
  criterion("overall_appearance", "Overall appearance and condition"),
];

// Additional checks for shoes
const shoeCriteria: QCCriterion[] = [
  criterion("sole_condition", "Sole wear, separation, and damage"),
  criterion("upper_condition", "Scratches, tears, and damage to the upper"),
  criterion("heel_condition", "Heel condition and stability"),
  criterion("odor_hygiene", "Cleanliness and unpleasant odor"),
  criterion("functionality", "Overall functionality and wearability"),
];

export const qcCriteriaByCategory: Record<string, QCCriterion[]> = {
  Tops: [
    ...clothingCriteria,
    ...fastenerCriteria,
  ],

  Bottoms: [
    ...clothingCriteria,
    ...fastenerCriteria,
  ],

  Dresses: [
    ...clothingCriteria,
    ...fastenerCriteria,
  ],

  Outerwear: [
    ...clothingCriteria,
    ...fastenerCriteria,
  ],

  Shoes: shoeCriteria,

  Accessories: accessoryCriteria,

  // Categories that may involve tailoring or repair work
  "Alterations & tailoring": clothingCriteria,
  "Repairs & denim": clothingCriteria,
  "Custom tailoring": clothingCriteria,
  "Upcycled accessories": accessoryCriteria,
  "Upcycled bags": accessoryCriteria,

  // Fallback for categories not explicitly listed
  default: clothingCriteria,
};
