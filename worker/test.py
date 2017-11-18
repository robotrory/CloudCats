from Face import ImageParser
import cv2

imageParser = ImageParser()

in_image = cv2.imread('person.jpg', cv2.IMREAD_COLOR)

out_img = imageParser.process(in_image)

cv2.imwrite('out.jpg', out_img)