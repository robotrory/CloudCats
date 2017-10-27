import cv2
from Face import ImageParser

imageParser = ImageParser()

img = cv2.imread('business_people.jpg', cv2.IMREAD_COLOR)
outImg = imageParser.process(img)
cv2.imwrite('out.jpg', outImg)
