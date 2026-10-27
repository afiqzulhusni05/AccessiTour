from enum import Enum as PyEnum

from sqlalchemy import Enum, String
from sqlalchemy.dialects.postgresql import ARRAY


def pg_enum(enum_cls: type[PyEnum], name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


def str_list() -> ARRAY:
    return ARRAY(String(30))