from app.services.kakao_place import find_verified_place


place = find_verified_place(["부산박물관", "Busan Museum"], region="BUSAN", place_category="ATTRACTION")

print(place)
