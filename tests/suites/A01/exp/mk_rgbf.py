import numpy as np, struct
n=4
xyz=np.array([[1,2,3],[4,5,6],[7,8,9],[10,11,12]],np.float32)
cols=[(255,0,0),(0,255,0),(0,0,255),(10,20,30)]
rec=np.zeros(n,dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('rgb','<u4')])
rec['x'],rec['y'],rec['z']=xyz.T
rec['rgb']=[(r<<16)|(g<<8)|b for r,g,b in cols]
h=f"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z rgb\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n"
open('rgbf_bin.pcd','wb').write(h.encode()+rec.tobytes())
# with alpha 255 (as PCL PointXYZRGB stores alpha=255 in the 4th byte)
rec['rgb']=[(255<<24)|(r<<16)|(g<<8)|b for r,g,b in cols]
open('rgbf_bin_a.pcd','wb').write(h.encode()+rec.tobytes())
