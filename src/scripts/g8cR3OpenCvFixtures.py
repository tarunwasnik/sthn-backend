import hashlib,json,cv2,numpy as np
fixtures=[]
for fixture_id,w,h,dw,dh,seed in [("two-by-two-to-three",2,2,3,3,1),("three-by-two-to-five-by-four",3,2,5,4,2),("three-by-three-to-two",3,3,2,2,3),("four-by-three-to-seven-by-five",4,3,7,5,4),("seven-by-five-to-three-by-two",7,5,3,2,5)]:
 data=np.fromiter(((seed*37+x*29+y*53+c*71)%256 for y in range(h) for x in range(w) for c in range(3)),dtype=np.uint8).reshape(h,w,3)
 out=cv2.resize(data,(dw,dh),interpolation=cv2.INTER_LINEAR)
 fixtures.append({"id":fixture_id,"sourceWidth":w,"sourceHeight":h,"destinationWidth":dw,"destinationHeight":dh,"source":data.reshape(-1).tolist(),"canonical":out.reshape(-1).tolist(),"canonicalSha256":hashlib.sha256(out.tobytes()).hexdigest()})
payload={"schemaVersion":"STHN_I4_G8C_R3_OPENCV_INTER_LINEAR_SYNTHETIC_V1","opencvVersion":cv2.__version__,"fixtures":fixtures}
payload["fixtureFingerprint"]=hashlib.sha256(json.dumps({k:v for k,v in payload.items() if k!="fixtureFingerprint"},separators=(",",":"),sort_keys=True).encode()).hexdigest()
print(json.dumps(payload))
