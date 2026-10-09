import base64,json,sys,hashlib,numpy as np,onnxruntime as ort
tensor=np.fromfile(sys.argv[2],dtype=np.float32).reshape((1,3,320,320))
s=ort.InferenceSession(sys.argv[1],providers=['CPUExecutionProvider'])
o=s.run(['output0'],{'images':tensor})[0]
raw=o.tobytes()
print(json.dumps({'python':sys.version.split()[0],'ort':ort.__version__,'providers':ort.get_available_providers(),'inputSha256':hashlib.sha256(tensor.tobytes()).hexdigest(),'shape':list(o.shape),'count':int(o.size),'finite':int(np.isfinite(o).sum()),'sha256':hashlib.sha256(raw).hexdigest(),'min':float(o.min()),'max':float(o.max()),'mean':float(o.mean()),'base64':base64.b64encode(raw).decode()}))
