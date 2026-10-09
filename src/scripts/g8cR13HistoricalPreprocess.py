import hashlib,json,platform,sys
import cv2,numpy as np

def digest(a, order):
 raw=a.tobytes(order='C')
 return {'shape':list(a.shape),'dtype':str(a.dtype),'channelOrder':order,'byteLength':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def historical(path):
 # Literal preprocessing portion of NudeNet 3.4.2 _read_image when passed bytes.
 source=np.fromfile(path,dtype=np.uint8); mat=cv2.imdecode(source,-1)
 w,h=mat.shape[1],mat.shape[0]; mat_c3=cv2.cvtColor(mat,cv2.COLOR_RGBA2BGR)
 side=max(mat_c3.shape[:2]); xp=side-mat_c3.shape[1]; yp=side-mat_c3.shape[0]
 padded=cv2.copyMakeBorder(mat_c3,0,yp,0,xp,cv2.BORDER_CONSTANT)
 resized=cv2.resize(padded,(320,320),interpolation=cv2.INTER_LINEAR)
 blob=cv2.dnn.blobFromImage(padded,1/255.0,(320,320),(0,0,0),swapRB=True,crop=False)
 return {'decodedNative':digest(mat,'OpenCV decode native'),'channelNormalized':digest(mat_c3,'BGR'),'squarePadded':digest(padded,'BGR'),'resized320':digest(resized,'BGR'),'preBlobImage':digest(padded,'BGR'),'tensor':digest(blob,'NCHW'),'pad':{'right':xp,'bottom':yp},'source':hashlib.sha256(source.tobytes()).hexdigest(),'width':w,'height':h}
def r9(path):
 source=np.fromfile(path,dtype=np.uint8); decoded=cv2.imdecode(source,cv2.IMREAD_UNCHANGED)
 if decoded.ndim==2: bgr=cv2.cvtColor(decoded,cv2.COLOR_GRAY2BGR)
 elif decoded.shape[2]==4: bgr=cv2.cvtColor(decoded,cv2.COLOR_BGRA2BGR)
 elif decoded.shape[2]==3: bgr=decoded
 else: raise RuntimeError('Unsupported OpenCV channel count')
 rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB); side=max(rgb.shape[:2]); square=np.zeros((side,side,3),dtype=np.uint8); square[:rgb.shape[0],:rgb.shape[1]]=rgb
 resized=cv2.resize(square,(320,320),interpolation=cv2.INTER_LINEAR); pre=cv2.cvtColor(square,cv2.COLOR_RGB2BGR)
 blob=cv2.dnn.blobFromImage(pre,1/255.0,(320,320),(0,0,0),swapRB=True,crop=False)
 return {'decodedNative':digest(decoded,'OpenCV decode native'),'channelNormalized':digest(rgb,'RGB'),'squarePadded':digest(square,'RGB'),'resized320':digest(resized,'RGB'),'preBlobImage':digest(pre,'BGR'),'tensor':digest(blob,'NCHW'),'source':hashlib.sha256(source.tobytes()).hexdigest()}
path=sys.argv[1]
print(json.dumps({'historical':historical(path),'r9':r9(path),'environment':{'python':sys.version,'numpy':np.__version__,'opencv':cv2.__version__,'platform':platform.platform()}}))
