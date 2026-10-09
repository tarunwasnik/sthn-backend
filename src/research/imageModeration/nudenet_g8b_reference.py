import argparse,json,hashlib,os,numpy as np,cv2,onnxruntime,nudenet.nudenet as nn
def digest(a): return hashlib.sha256(a.tobytes()).hexdigest()
def stats(a): return {'shape':list(a.shape),'dtype':str(a.dtype),'count':int(a.size),'finite':int(np.isfinite(a).sum()),'min':float(a.min()),'max':float(a.max()),'mean':float(a.mean()),'digest':digest(a)}
def main():
 p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--manifest',required=True);p.add_argument('--model',required=True);p.add_argument('--out',required=True);a=p.parse_args(); pre=json.load(open(a.manifest)); inv=json.load(open(os.path.join(a.root,'evaluation-cache','image-moderation','benchmark','inventory-manifest.json')));by={x['id']:x for x in inv['candidates']};s=onnxruntime.InferenceSession(a.model,providers=['CPUExecutionProvider']);rows=[]
 for item in pre['selection']['selected']:
  c=by[item['candidateId']]; b=open(os.path.join(a.root,'evaluation-cache','image-moderation','benchmark',c['localAsset']),'rb').read(); mat=cv2.imdecode(np.frombuffer(b,np.uint8),-1); blob,xr,yr,xp,yp,w,h=nn._read_image(b,320); out=s.run(None,{s.get_inputs()[0].name:blob})[0]; trans=np.transpose(np.squeeze(out[0])); mx=trans[:,4:].max(axis=1); rows.append({'candidateId':c['id'],'candidateSha256':c['sha256'],'source':{'width':w,'height':h,'channels':int(mat.shape[2]) if len(mat.shape)==3 else 1},'pad':{'right':xp,'bottom':yp,'square':[w+xp,h+yp],'value':0},'tensor':stats(blob),'raw':stats(out),'anchors':int(trans.shape[0]),'maxNativeClassScore':float(mx.max()),'anchorsAtOrAbove020':int((mx>=.2).sum()),'detections':nn._postprocess([out],xp,yp,xr,yr,w,h,320,320)})
 json.dump({'runtime':'canonical-nudenet-3.4.2','rows':rows},open(a.out,'w'),indent=2)
if __name__=='__main__': main()
