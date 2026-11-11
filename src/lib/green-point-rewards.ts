export const GREEN_POINT_REWARDS = {
  registration: 2000,
  donationResaleQualityPerItem: 5000,
  donationUpcyclingQualityPerItem: 3000,
  donationSocialPerItem: 2000,
  purchaseRate: 0.02,
} as const;

export type DonationClassificationCounts = {
  resaleQualityItems: number;
  upcyclingQualityItems: number;
  socialDonationItems: number;
  rejectedItems: number;
};

export function calculateDonationReward(counts: DonationClassificationCounts): number {
  return counts.resaleQualityItems * GREEN_POINT_REWARDS.donationResaleQualityPerItem
    + counts.upcyclingQualityItems * GREEN_POINT_REWARDS.donationUpcyclingQualityPerItem
    + counts.socialDonationItems * GREEN_POINT_REWARDS.donationSocialPerItem;
}
