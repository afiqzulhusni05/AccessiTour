from app.services.kakao_place import find_verified_place


place = find_verified_place(
    names=[
        "카파도키아 부산대점",
        "Cappadocia Busan National University Branch",
    ],
    region="BUSAN",
    place_category="FOOD",
)

print(place)
