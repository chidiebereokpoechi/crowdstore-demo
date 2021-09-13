import argparse
import os
import time
from datetime import datetime
from threading import Thread

import cv2
import dlib
import imutils
import numpy as np
from imutils.io import TempFile
from imutils.video import FPS, VideoStream
from sourced.centroidtracker import CentroidTracker
from sourced.trackableobject import TrackableObject
from sourced.utils import Conf

# construct the argument parse and parse the arguments
ap = argparse.ArgumentParser()
ap.add_argument("-i", "--input", type=str,
	help="path to optional input video file")
ap.add_argument("-o", "--output", type=str,
	help="path to optional output video file")
ap.add_argument("-c", "--confidence", type=float, default=0.4,
	help="minimum probability to filter weak detections")
ap.add_argument("-s", "--skip-frames", type=int, default=30,
	help="# of skip frames between detections")
args = vars(ap.parse_args())

# load serial model
prototxt = "MobileNetSSD_deploy.prototxt.txt"
caffemodel = "MobileNetSSD_deploy.caffemodel"


# identify the classes MobileNetSSD should detect
CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
	"bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
	"dog", "horse", "motorbike", "person", "pottedplant", "sheep",
	"sofa", "train", "tvmonitor"]


# load our serialized model from disk
print("[INFO] loading model...")
net = cv2.dnn.readNetFromCaffe(prototxt, caffemodel)

# if the video file is not specified, the web cam is used instead
if not args.get("input", False):
	print("[INFO] initiating video stream...bot....bot..")
	vs = VideoStream(src=0).start()
	time.sleep(2.0)
else:
	print("[INFO] playing video file...bot....bot...")
	vs = cv2.VideoCapture(args["input"])


# Initialize the video writer
writer = None
# and frame dimenstions (width and height)
W = None
H = None

# initiatize centroid tracker python file
ct = CentroidTracker(maxDisappeared=40, maxDistance=50)
trackers = []
trackableObjects = {}


# initialize the total number of frames processed so far,
# the number of people moving up or moving down
totalFrames = 0
totalDown = 0
totalUp = 0


# initialize the various points used to calculate the avg of the vehicle speed
points = [("A", "B"), ("B", "C"), ("C", "D")]


# start the frames per second throughput estimator
fps = FPS().start()


# LOOPING THROUGH THE FRAMES OF THE VIDEO STREAM
while True:

	frame = vs.read()
	frame = frame[1] if args.get("input", False) else frame

	# if we move through the video and there are no more frames to process,
	# then we have reached the end of the video
	if args["input"] is not None and frame is None:
		break

	# resize the frame to have a maximum width of 500 pixels( for faster processing)
	# then convert to RGB for dlib
	frame = imutils.resize(frame, width=1500, height=1500)
	rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

	# if the frame dimensions are empty, set them
	if W is None or H is None:
		(H, W) = frame.shape[:2]

	# initializing the writer to write the video into a disk
	if args["output"] is not None and writer is None:
		fourcc = cv2.VideoWriter_fourcc(*"MJPG")
		writer = cv2.VideoWriter(args["output"], fourcc, 30,
			(W, H), True)

	status = "Waiting"
	rects = []

	# checking to see if a more computationally expensive object detection method to aid our tracker
	if totalFrames % args["skip_frames"] == 0:
		# set the status and initialize a new set of object trackers
		status = "Detecting"
		trackers = []

		# convert the frame to a blob and pass it through a network
		# and obtain the detections
		blob = cv2.dnn.blobFromImage(frame, 0.007843, (W, H), 127.5)
		net.setInput(blob)
		detections = net.forward()

		# LOOP THROUGH THE DETECTIONS
		for i in np.arange(0, detections.shape[2]):
			confidence = detections[0, 0, i, 2]

			# filter out weak detections by requiring a minimum confidence
			if confidence > args["confidence"]:
				idx = int(detections[0, 0, i, 1])

				# if it is not a person, ignore it
				if CLASSES[idx] != "person":
					continue

				# /compute the (x, y)-coordinates of the bounding box
				box = detections[0, 0, i, 3:7] * np.array([W, H, W, H])
				(startX, startY, endX, endY) = box.astype("int")

				# construct a dlib rectangle object from the bounding box coordinates and
				# then start the dlib coordination trackers
				tracker = dlib.correlation_tracker()
				rect = dlib.rectangle(startX, startY, endX, endY)
				tracker.start_track(rgb, rect)

				# add the tracker to our lost of trackers
				trackers.append(tracker)

	# utilizing object *trackers* rather than object *detectors*
	# to obtain a higher frame processing throughput
	else:
		# loop over the trackers
		for tracker in trackers:

			# set to tracking rather than waiting or detecting
			status = "Tracking"

			# update the tracker and grab the updated position
			tracker.update(rgb)
			pos = tracker.get_position()

			# unpack the position object
			startX = int(pos.left())
			startY = int(pos.top())
			endX = int(pos.right())
			endY = int(pos.bottom())

			# add the bounding box coordinates to the rectangle's list
			rects.append((startX, startY, endX, endY))

	# draw a horizontal line in the center of the frame
	# ( this determines whether it is moving up or down)
	cv2.line(frame, (0, H // 2), (W, H // 2), (0, 255, 255), 2)

	# use the centroid tracker to associate old objects with objects that have been computed newly
	objects = ct.update(rects)

	# LOOP OVER THE TRACKED OBJECTS
	for (objectID, centroid) in objects.items():
		# check to see if a trackable object exists for the current object ID
		to = trackableObjects.get(objectID, None)

		# if there is no existing trackable object, then create one
		if to is None:
			to = TrackableObject(objectID, centroid)

		# Else there is a trackable object that we can use to detemine the direction
		elif not to.estimated:

			if to.direction is None:
				# the difference between the y-coordinate
				# and the mean of the previous centroids will determine the direction of the moving object
				# (negative for up , positive for down)
				y = [c[1] for c in to.centroids]
				direction = centroid[1] - np.mean(y)
				to.centroids.append(centroid)
				to.direction = direction

				# if the direction is positive (indicating the object
	            # is moving from left to right)
				if to.direction > 0:
	                # check to see if timestamp has been noted for
	                # point A
					if to.timestamp["A"] == 0:

	                    # if the centroid's x-coordinate is greater than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
						if centroid[0] > conf["speed_estimation_zone"]["A"]:
							to.timestamp["A"] = ts
	                    	to.position["A"] = centroid[0]

	                # check to see if timestamp has been noted for
	                # point B
	                elif to.timestamp["B"] == 0:

	                    # if the centroid's x-coordinate is greater than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
	                    if centroid[0] > conf["speed_estimation_zone"]["B"]:
	                        to.timestamp["B"] = ts
	                        to.position["B"] = centroid[0]
	                # check to see if timestamp has been noted for
	                # point C
	                elif to.timestamp["C"] == 0:
	                    # if the centroid's x-coordinate is greater than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
	                    if centroid[0] > conf["speed_estimation_zone"]["C"]:
	                        to.timestamp["C"] = ts
	                        to.position["C"] = centroid[0]
	                # check to see if timestamp has been noted for
	                # point D
	                elif to.timestamp["D"] == 0:
	                    # if the centroid's x-coordinate is greater than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp, set the position as the
	                    # centroid's x-coordinate, and set the last point
	                    # flag as True
	                    if centroid[0] > conf["speed_estimation_zone"]["D"]:
	                        to.timestamp["D"] = ts
	                        to.position["D"] = centroid[0]
	                        to.lastPoint = True

				# if the direction is negative (indicating the object
	            # is moving from right to left)
				elif to.direction < 0:
					# check to see if timestamp has been noted for
					# point D
					if to.timestamp["D"] == 0:
	                    # if the centroid's x-coordinate is lesser than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
	                	if centroid[0] < conf["speed_estimation_zone"]["D"]:
							to.timestamp["D"] = ts
	                    	to.position["D"] = centroid[0]
	                # check to see if timestamp has been noted for
	                # point C
	                elif to.timestamp["C"] == 0:
	                    # if the centroid's x-coordinate is lesser than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
	                    if centroid[0] < conf["speed_estimation_zone"]["C"]:
	                        to.timestamp["C"] = ts
	                        to.position["C"] = centroid[0]
	                # check to see if timestamp has been noted for
	                # point B
	                elif to.timestamp["B"] == 0:
	                    # if the centroid's x-coordinate is lesser than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp and set the position as the
	                    # centroid's x-coordinate
	                    if centroid[0] < conf["speed_estimation_zone"]["B"]:
	                        to.timestamp["B"] = ts
	                        to.position["B"] = centroid[0]
	                # check to see if timestamp has been noted for
	                # point A
	                elif to.timestamp["A"] == 0:
	                    # if the centroid's x-coordinate is lesser than
	                    # the corresponding point then set the timestamp
	                    # as current timestamp, set the position as the
	                    # centroid's x-coordinate, and set the last point
	                    # flag as True
	                    if centroid[0] < conf["speed_estimation_zone"]["A"]:
	                        to.timestamp["A"] = ts
	                        to.position["A"] = centroid[0]
	                        to.lastPoint = True

	            if to.lastPoint and not to.estimated:
	                # initialize the list of estimated speeds
	                estimatedSpeeds = []

                	# loop over all the pairs of points and estimate the
                	# vehicle speed
                	for (i, j) in points:
                    	# calculate the distance in pixels
                    	d = to.position[j] - to.position[i]
                    	distanceInPixels = abs(d)
	                    # check if the distance in pixels is zero, if so,
	                    # skip this iteration
	                    if distanceInPixels == 0:
	                        continue
	                    # calculate the time in hours
	                    t = to.timestamp[j] - to.timestamp[i]
	                    timeInSeconds = abs(t.total_seconds())
	                    timeInHours = timeInSeconds / (60 * 60)
	                    # calculate distance in kilometers and append the
	                    # calculated speed to the list
	                    distanceInMeters = distanceInPixels * meterPerPixel
	                    distanceInKM = distanceInMeters / 1000
	                    estimatedSpeeds.append(distanceInKM / timeInHours)




	                # calculate the average speed
	                to.calculate_speed(estimatedSpeeds)

	                # set the object as estimated
	                to.estimated = True
	                print("[INFO] Speed of the person that just passed"\
	                    " is: {:.2f} M/s".format(to.speedMPS))




					# to check of the object has been counted or not
					if not to.counted:
						# (if the direction is negative and the centroidis above the line, count as "up")
						if direction < 0 and centroid[1] < H //2:
							totalUp += 1
							to.counted = True

						# (if the direction is positive and the centroidis below the line, count as "down")
						elif direction > 0 and centroid[1] > H //2:
							totalDown += 1
							to.counted = True

		# store the object in the dictionary
		trackableObjects[objectID] = to

		# draw both the ID of the object and the centroid of the object on the output frame
		text = "ID {}". format(objectID)
		cv2.putText (frame, text, (centroid[0] - 10, centroid[1] - 10),
			cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
		cv2.circle(frame, (centroid[0], centroid[1]), 4, (0, 255, 0), -1)

	# construct information that will display on the frame
	info = [
		("Up", totalUp),
		("Down", totalDown),
		("Status", status)
	]

	# loop over the info tuples and draw them on our frame
	for (i, (k, v)) in enumerate(info):
		text = "{}: {}".format(k, v)
		cv2.putText(frame, text, (10, H - ((i * 20) + 20)),
			cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)


	# check to see writing the frame on the disk is needed
	if writer is not None:
		writer.write(frame)


	# output the frame
	cv2.imshow("Frame", frame)
	key = cv2.waitKey(1) & 0xFF

	# pressing 'Q' to break the loop
	if key == ord("q"):
		break

	# increment the total number of frames processed thus far 
	# and then update the FPS counter
	totalFrames += 1
	fps.update()

# stop the timer and display FPS information
fps.stop()
print("[INFO] elapsed time: {:.2f}".format(fps.elapsed()))
print("[INFO] approx. FPS: {:.2f}".format(fps.fps()))

# check to see if you need to release the video writer pointer
if writer is not None:
	writer.release()

# if we are not using a video file, stop the video
if not args.get("input", False):
	vs.stop()

# otherwise, release the video file pointer
else:
	vs.release()

# close any open windows
cv2.destroyAllWindows()
