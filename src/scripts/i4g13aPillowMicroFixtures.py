import hashlib,json,os,sys
from PIL import Image
out=sys.argv[1];os.makedirs(out,exist_ok=True)
specs=[('constant',7,5,3,2),('hgradient',17,9,5,4),('vgradient',9,17,4,5),('vedge',13,11,4,3),('hedge',11,13,3,4),('impulse',9,9,4,4),('checker',19,15,7,5),('rgb',17,13,6,5),('odd',23,11,7,3),('nondiv',29,17,8,5),('downsample',61,47,9,7)]
rows=[]
for name,w,h,dw,dh in specs:
 b=bytearray(w*h*3)
 for y in range(h):
  for x in range(w):
   i=(y*w+x)*3
   if name=='constant': v=(23,137,241)
   elif name=='hgradient': v=(x*255//max(1,w-1),x*17%256,x*41%256)
   elif name=='vgradient': v=(y*19%256,y*255//max(1,h-1),y*43%256)
   elif name=='vedge': v=(0,0,0) if x<w//2 else (255,255,255)
   elif name=='hedge': v=(0,0,0) if y<h//2 else (255,255,255)
   elif name=='impulse': v=(255,127,63) if (x,y)==(w//2,h//2) else (0,0,0)
   elif name=='checker': v=((255 if (x+y)%2 else 0), (255 if x%3==0 else 0), (255 if y%4==0 else 0))
   else: v=((x*31+y*7)%256,(x*3+y*29)%256,(x*y*13)%256)
   b[i:i+3]=bytes(v)
 src=bytes(b); img=Image.frombytes('RGB',(w,h),src); dst=img.resize((dw,dh),Image.Resampling.BICUBIC); ref=dst.tobytes();sp=os.path.join(out,name+'.src.rgb');rp=os.path.join(out,name+'.ref.rgb');open(sp,'wb').write(src);open(rp,'wb').write(ref);rows.append({'id':name,'source':[w,h],'destination':[dw,dh],'sourcePath':sp,'referencePath':rp,'sourceSha256':hashlib.sha256(src).hexdigest(),'referenceSha256':hashlib.sha256(ref).hexdigest()})
print(json.dumps({'pillow':'12.3.0','fixtures':rows},indent=2))
