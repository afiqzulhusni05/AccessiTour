from enum import Enum


class ServiceType(str, Enum):
    MICRO = "MICRO"
    FULL_DAY = "FULL_DAY"


class Region(str, Enum):
    SEOUL = "SEOUL"
    BUSAN = "BUSAN"
    JEJU = "JEJU"


class Language(str, Enum):
    KO = "ko"
    EN = "en"
    ZH = "zh"
    JA = "ja"
    VI = "vi"
    TH = "th"
    MS = "ms"
    ID = "id"


class MobilityLevel(str, Enum):
    NORMAL = "NORMAL"
    SLOW_WALK = "SLOW_WALK"
    WHEELCHAIR = "WHEELCHAIR"


class TransportPreference(str, Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"
    NO_PREFERENCE = "NO_PREFERENCE"


class TransportOption(str, Enum):
    PUBLIC_TRANSIT = "PUBLIC_TRANSIT"
    OWN_CAR = "OWN_CAR"
    CAN_ARRANGE_CAR = "CAN_ARRANGE_CAR"


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"


class GenderPreference(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    NO_PREFERENCE = "NO_PREFERENCE"


class Attribute(str, Enum):
    FOOD = "FOOD"
    CAFE = "CAFE"
    KPOP = "KPOP"
    KDRAMA = "KDRAMA"
    CULTURE = "CULTURE"
    HISTORY = "HISTORY"
    NATURE = "NATURE"
    SHOPPING = "SHOPPING"
    NIGHTLIFE = "NIGHTLIFE"


class Dietary(str, Enum):
    HALAL = "HALAL"
    VEGETARIAN = "VEGETARIAN"
    VEGAN = "VEGAN"
    NO_PORK = "NO_PORK"
    NO_BEEF = "NO_BEEF"
    NO_SEAFOOD = "NO_SEAFOOD"
    NUT_ALLERGY = "NUT_ALLERGY"


class AccessibilityExperience(str, Enum):
    WHEELCHAIR_SUPPORT = "WHEELCHAIR_SUPPORT"
    SLOW_WALK_SUPPORT = "SLOW_WALK_SUPPORT"
    FIRST_AID = "FIRST_AID"
    SIGN_LANGUAGE = "SIGN_LANGUAGE"
    SENIOR_SUPPORT = "SENIOR_SUPPORT"


class BookingStatus(str, Enum):
    REQUESTED = "REQUESTED"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    ITINERARY_DRAFT = "ITINERARY_DRAFT"
    IN_REVIEW = "IN_REVIEW"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class EditedBy(str, Enum):
    AI = "AI"
    TOURIST = "TOURIST"
    GUIDE = "GUIDE"