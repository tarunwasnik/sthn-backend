import hashlib,json,os,sys
from PIL import Image
m=json.load(open(sys.argv[1]));out=sys.argv[2];os.makedirs(out,exist_ok=True);rows=[]
for c in m['controls']:
 im=Image.open(c['path']).convert('RGB');w,h=im.size;s=384/min(w,h);rw,rh=int(w*s),int(h*s);im=im.resize((rw,rh),Image.Resampling.BICUBIC);l=round((rw-384)/2);t=round((rh-384)/2);b=im.crop((l,t,l+384,t+384)).tobytes();p=os.path.join(out,c['id']+'.ref.rgb');open(p,'wb').write(b);rows.append({'id':c['id'],'source':[w,h],'resize':[rw,rh],'crop':[l,t,384,384],'path':p,'sha256':hashlib.sha256(b).hexdigest()})
print(json.dumps({'rows':rows}))
