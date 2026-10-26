// Choice lists shared by the trip profile and guide sign-up forms. The ids are what the backend stores.
import type { Mobility } from "./types";

export const LANGS = ["en", "ko", "ja", "zh", "vi", "th", "ms", "id"];
export const MOBILITY: Mobility[] = ["normal", "slow", "wheelchair"];
export const INTERESTS = ["food", "cafe", "culture", "history", "nature", "shopping", "kpop", "kdrama", "japanese_culture", "nightlife"];
export const DIETARY = ["halal", "vegetarian", "vegan", "no_pork", "no_beef", "no_seafood", "nut_allergy"];
// What a guide can offer, exactly as the team API defines them
export const GUIDE_INTERESTS = ["food", "cafe", "kpop", "kdrama", "culture", "history", "nature", "shopping", "nightlife"];
export const GUIDE_REGIONS = ["seoul", "busan", "jeju"];
export const ACCESS_TAGS = ["wheelchair_support", "slow_walk_support", "elderly_support", "first_aid", "sign_language"];

export const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
