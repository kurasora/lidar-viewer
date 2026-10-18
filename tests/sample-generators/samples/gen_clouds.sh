set -e
cd /home/claude/samples
export QT_QPA_PLATFORM=offscreen
O=out; C=cc
cc(){ timeout 120 xvfb-run -a CloudCompare -SILENT -NO_TIMESTAMP "$@" > /dev/null 2>&1; }
for e in asc txt csv pts xyz neu bin vtk sbf; do cp $C/src.$e $O/cc_cloud.$e; done
cp $C/src.sbf.data $O/cc_cloud.sbf.data
cp $C/src.ply $O/cc_cloud_binary.ply
rm -rf tmp && mkdir -p tmp && cp src/src.ply tmp/a.ply && (cd tmp && cc -O a.ply -C_EXPORT_FMT PLY -PLY_EXPORT_FMT ASCII -SAVE_CLOUDS) && cp tmp/a.ply $O/cc_cloud_ascii.ply
pcl_converter src/src.ply tmp/pcl.pcd -f binary -c > /dev/null
pcl_convert_pcd_ascii_binary tmp/pcl.pcd $O/pcl_ascii.pcd 0 > /dev/null
pcl_convert_pcd_ascii_binary tmp/pcl.pcd $O/pcl_binary.pcd 1 > /dev/null
pcl_convert_pcd_ascii_binary tmp/pcl.pcd $O/pcl_binary_compressed.pcd 2 > /dev/null
