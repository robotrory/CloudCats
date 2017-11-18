import cv2
import itertools
import os

import numpy as np
np.set_printoptions(precision=2)

import openface

class ImageParser(object):
    def __init__(self):
      fileDir = os.path.dirname(os.path.realpath(__file__))
      modelDir = os.path.join(fileDir, '/root/openface/', 'models')
      dlibModelDir = os.path.join(modelDir, 'dlib')
      openfaceModelDir = os.path.join(modelDir, 'openface')

      imgDim = 96
      self.align = openface.AlignDlib(os.path.join(dlibModelDir, "shape_predictor_68_face_landmarks.dat"))

      self.catHeadImg = cv2.imread('cats/cat_head.png', cv2.IMREAD_UNCHANGED)
      self.catMouthImg = cv2.imread('cats/cat_mouth.png', cv2.IMREAD_UNCHANGED)
      self.catWidth = self.catHeadImg.shape[0]
      self.catHeight = self.catHeadImg.shape[1]
      self.sf = 1.8
      self.yOffset = 1.2

    def process(self, img):
      bgrImg = img.copy()
      if bgrImg is None:
          raise Exception("Unable to load image: {}".format(imgPath))
      rgbImg = cv2.cvtColor(bgrImg, cv2.COLOR_BGR2RGB)


      bbs = self.align.getAllFaceBoundingBoxes(rgbImg)
      np_bbs = np.array([[b.left(), b.top(), b.right(), b.bottom()] for b in bbs])
      final_bbs = self.non_max_suppression_fast(np_bbs, 0.3)
      sorted_bbs = sorted(zip(final_bbs, bbs), key=lambda x: x[0][2]-x[0][0])
      for (bb, dlibBB) in sorted_bbs:
        landmarks = self.align.findLandmarks(rgbImg, dlibBB)
        
        bbWidth = (bb[2]-bb[0])
        resizeWidth = int(round(bbWidth * self.sf))
        resizeHeight = int(round(self.sf * self.catHeight * (bbWidth / float(self.catWidth))))
        resizedCatHeadImg = cv2.resize(self.catHeadImg, (resizeWidth, resizeHeight))    
        resizedCatMouthImg = cv2.resize(self.catMouthImg, (resizeWidth, resizeHeight))    
        drawX = int(round((bb[0] + bb[2])/2-(resizeWidth/2)))
        drawY = int(round((bb[1] + bb[3])/2-(resizeHeight/2) * self.yOffset))

        self.overlay_image_alpha(bgrImg,
                        resizedCatHeadImg[:, :, 0:3],
                        (drawX, drawY),
                        resizedCatHeadImg[:, :, 3] / 255.0)

        yParting = self.get_parting(landmarks)

        self.overlay_image_alpha(bgrImg,
                        resizedCatMouthImg[:, :, 0:3],
                        (drawX, drawY + yParting),
                        resizedCatMouthImg[:, :, 3] / 255.0)

      # cv2.rectangle(bgrImg, (bb.left(), bb.top()), (bb.right(), bb.bottom()), (0,255,0), 3)
      return bgrImg

    def get_parting(self, landmarks):
      diff1 = landmarks[67][1]-landmarks[61][1]
      diff2 = landmarks[66][1]-landmarks[62][1]
      diff3 = landmarks[65][1]-landmarks[63][1]
      parting = (diff1 + diff2 + diff3) / 3
      return parting

    def overlay_image_alpha(self, img, img_overlay, pos, alpha_mask):
        """Overlay img_overlay on top of img at the position specified by
        pos and blend using alpha_mask.

        Alpha mask must contain values within the range [0, 1] and be the
        same size as img_overlay.
        """

        x, y = pos

        # Image ranges
        y1, y2 = max(0, y), min(img.shape[0], y + img_overlay.shape[0])
        x1, x2 = max(0, x), min(img.shape[1], x + img_overlay.shape[1])

        # Overlay ranges
        y1o, y2o = max(0, -y), min(img_overlay.shape[0], img.shape[0] - y)
        x1o, x2o = max(0, -x), min(img_overlay.shape[1], img.shape[1] - x)

        # Exit if nothing to do
        if y1 >= y2 or x1 >= x2 or y1o >= y2o or x1o >= x2o:
            return

        channels = img.shape[2]

        alpha = alpha_mask[y1o:y2o, x1o:x2o]
        alpha_inv = 1.0 - alpha

        for c in range(channels):
            img[y1:y2, x1:x2, c] = (alpha * img_overlay[y1o:y2o, x1o:x2o, c] +
                                    alpha_inv * img[y1:y2, x1:x2, c])

    # Malisiewicz et al.
    def non_max_suppression_fast(self, boxes, overlapThresh):
      # if there are no boxes, return an empty list
      if len(boxes) == 0:
        return []
     
      # if the bounding boxes integers, convert them to floats --
      # this is important since we'll be doing a bunch of divisions
      if boxes.dtype.kind == "i":
        boxes = boxes.astype("float")
     
      # initialize the list of picked indexes 
      pick = []
     
      # grab the coordinates of the bounding boxes
      x1 = boxes[:,0]
      y1 = boxes[:,1]
      x2 = boxes[:,2]
      y2 = boxes[:,3]
     
      # compute the area of the bounding boxes and sort the bounding
      # boxes by the bottom-right y-coordinate of the bounding box
      area = (x2 - x1 + 1) * (y2 - y1 + 1)
      idxs = np.argsort(y2)
     
      # keep looping while some indexes still remain in the indexes
      # list
      while len(idxs) > 0:
        # grab the last index in the indexes list and add the
        # index value to the list of picked indexes
        last = len(idxs) - 1
        i = idxs[last]
        pick.append(i)
     
        # find the largest (x, y) coordinates for the start of
        # the bounding box and the smallest (x, y) coordinates
        # for the end of the bounding box
        xx1 = np.maximum(x1[i], x1[idxs[:last]])
        yy1 = np.maximum(y1[i], y1[idxs[:last]])
        xx2 = np.minimum(x2[i], x2[idxs[:last]])
        yy2 = np.minimum(y2[i], y2[idxs[:last]])
     
        # compute the width and height of the bounding box
        w = np.maximum(0, xx2 - xx1 + 1)
        h = np.maximum(0, yy2 - yy1 + 1)
     
        # compute the ratio of overlap
        overlap = (w * h) / area[idxs[:last]]
     
        # delete all indexes from the index list that have
        idxs = np.delete(idxs, np.concatenate(([last],
          np.where(overlap > overlapThresh)[0])))
     
      # return only the bounding boxes that were picked using the
      # integer data type
      return boxes[pick].astype("int")