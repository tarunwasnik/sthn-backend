import base64, hashlib, json, sys
import numpy as np
import timm
from PIL import Image
controls_path, config_path, result_path = sys.argv[1:4]
with open(controls_path, encoding="utf-8") as handle: controls=json.load(handle)
with open(config_path, encoding="utf-8") as handle: config=json.load(handle)
model=timm.create_model(config["architecture"], pretrained=False, num_classes=config["num_classes"]); model.pretrained_cfg=config["pretrained_cfg"]
data=timm.data.resolve_model_data_config(model); transform=timm.data.create_transform(**data,is_training=False)
rows=[]
for control in controls["controls"]:
  with Image.open(control["path"]) as image:
    original=image.size; converted=image.convert("RGB"); tensor=transform(converted).unsqueeze(0).numpy().astype(np.float32,copy=False)
  rows.append({"controlId":control["id"],"sourceDimensions":list(original),"resizeDimensions":[384,384],"crop":{"mode":"center","coordinates":[0,0],"dimensions":[384,384],"cropPct":1.0},"finalDimensions":[384,384],"shape":list(tensor.shape),"dtype":str(tensor.dtype),"elementCount":int(tensor.size),"digest":hashlib.sha256(tensor.tobytes()).hexdigest(),"tensorBase64":base64.b64encode(tensor.tobytes()).decode("ascii")})
with open(result_path,"w",encoding="utf-8") as handle: json.dump({"reference":"PIL.Image.open without ImageOps.exif_transpose; convert(RGB); timm inference transform", "rows":rows},handle,indent=2);handle.write("\n")
