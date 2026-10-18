// 試作ページ用: 形式ごとのサンプル（samples/ に置いたファイル）。作った道具も書いておく
export const SAMPLE_GROUPS = [
  ['点群', [
    ['.pcd ascii', ['pcl_ascii.pcd'], 'PCL'], ['.pcd binary', ['pcl_binary.pcd'], 'PCL'], ['.pcd 圧縮', ['pcl_binary_compressed.pcd'], 'PCL'],
    ['.las', ['laspy_utm.las'], 'laspy（UTM 座標）'], ['.laz', ['laspy_14.laz'], 'laspy + lazrs（LAS 1.4）'], ['.e57', ['pye57_2scans.e57'], 'pye57（2 スキャン・位置付き）'],
    ['.ply 文字', ['cc_cloud_ascii.ply'], 'CloudCompare'], ['.ply バイナリ', ['cc_cloud_binary.ply'], 'CloudCompare'], ['.ptx', ['handmade_2scans.ptx'], '手書き（2 スキャン）'],
    ['.txt', ['cc_cloud.txt'], 'CloudCompare'], ['.asc', ['cc_cloud.asc'], 'CloudCompare（見出しつき）'], ['.neu', ['cc_cloud.neu'], 'CloudCompare（タブ区切り）'],
    ['.xyz', ['cc_cloud.xyz'], 'CloudCompare（; 区切り）'], ['.pts', ['cc_cloud.pts'], 'CloudCompare（点数つき）'], ['.csv', ['cc_cloud.csv'], 'CloudCompare（, 区切り）'],
    ['.csv 表', ['handmade_matrix.csv'], '手書き（CSV matrix）'],
    ['.bin', ['cc_cloud.bin'], 'CloudCompare'], ['.bin シフト', ['cc_cloud_shift.bin'], 'CloudCompare（グローバルシフト）'], ['.bin 2 個', ['cc_two_clouds.bin'], 'CloudCompare（点群 2 個）'],
    ['.bin 法線', ['cc_cloud_normals.bin'], 'CloudCompare（法線・値の欄）'], ['.bin スキャン', ['cc_ptx_scans.bin'], 'CloudCompare（スキャナー情報つき）'],
    ['.sbf', ['cc_cloud.sbf', 'cc_cloud.sbf.data'], 'CloudCompare（.sbf + .sbf.data）'], ['.vtk 点群', ['cc_cloud.vtk'], 'CloudCompare'],
    ['.pn', ['handmade_cloud.pn'], '手書き'], ['.pv', ['handmade_cloud.pv'], '手書き'], ['.soi', ['handmade_2scans.soi'], '手書き'], ['.out', ['handmade_bundler.out'], '手書き（Bundler）'],
    ['.pov', ['handmade_scans.pov', 'pov_scan0.asc', 'pov_scan1.asc'], '手書き（.pov + 点群 2 個）'], ['.icm', ['handmade_images.icm', 'icm_cloud.asc', 'icm_images.wrl'], '手書き（.icm + 点群）'],
    ['.drc 点群', ['dracopy_cloud.drc'], 'DracoPy'],
  ]],
  ['メッシュ', [
    ['.obj', ['cc_mesh.obj'], 'CloudCompare'], ['.stl バイナリ', ['cc_mesh.stl'], 'CloudCompare'], ['.stl 文字', ['trimesh_mesh_ascii.stl'], 'trimesh'],
    ['.off', ['cc_mesh.off'], 'CloudCompare'], ['.vtk', ['cc_mesh.vtk'], 'CloudCompare'], ['.ply 面', ['trimesh_mesh.ply'], 'trimesh'],
    ['.bin メッシュ', ['cc_mesh.bin'], 'CloudCompare'], ['.bin 面と線', ['cc_mesh_lines.bin'], 'CloudCompare（メッシュ + ポリライン）'], ['.bin 平面', ['cc_plane.bin'], 'CloudCompare（平面の部品）'], ['.bin 貼り付け', ['cc_mesh_textured.bin'], 'CloudCompare（テクスチャつき）'],
    ['.glb', ['trimesh_mesh.glb'], 'trimesh'], ['.gltf', ['trimesh_mesh.gltf'], 'trimesh'], ['.dae', ['trimesh_mesh.dae'], 'trimesh + pycollada'],
    ['.fbx 文字', ['handmade_ascii.fbx'], '手書き（FBX 7.4）'], ['.fbx バイナリ', ['handmade_binary.fbx'], '手書き（FBX 7.4）'], ['.drc メッシュ', ['dracopy_mesh.drc'], 'DracoPy'],
  ]],
  ['図面・CAD・GIS', [
    ['.dxf', ['ezdxf_drawing.dxf'], 'ezdxf'], ['.shp 点', ['pyshp_points.shp', 'pyshp_points.shx', 'pyshp_points.dbf'], 'pyshp（UTM 座標・属性つき）'], ['.shp 線', ['pyshp_lines.shp', 'pyshp_lines.shx', 'pyshp_lines.dbf'], 'pyshp'],
    ['.ifc', ['ifcopenshell_building.ifc'], 'IfcOpenShell'], ['.step', ['gmsh_parts.step'], 'gmsh（OpenCASCADE）'], ['.mac', ['handmade_plant.mac'], '手書き（PDMS）'],
    ['.poly', ['handmade_lines.poly'], '手書き（Salome Hydro）'], ['.sx', ['handmade_lines.sx'], '手書き（SinusX）'], ['.psz', ['handmade_project.psz'], '手書き（PhotoScan の構成）'],
  ]],
  ['画像・ラスター', [
    ['.tif 高さ', ['tifffile_dem.tif'], 'tifffile（GeoTIFF）'], ['.tif 画像', ['tifffile_rgb.tif'], 'tifffile'],
    ['.png', ['pillow_topview.png'], 'Pillow'], ['.jpg', ['pillow_topview.jpg'], 'Pillow'], ['.bmp', ['pillow_topview.bmp'], 'Pillow'], ['.gif', ['pillow_topview.gif'], 'Pillow'],
    ['.webp', ['pillow_topview.webp'], 'Pillow'], ['.tga', ['pillow_topview.tga'], 'Pillow'], ['.ppm', ['pillow_topview.ppm'], 'Pillow'], ['.pgm', ['pillow_topview.pgm'], 'Pillow'],
    ['.pbm', ['pillow_topview.pbm'], 'Pillow'], ['.ico', ['pillow_topview.ico'], 'Pillow'], ['.cur', ['handmade_topview.cur'], '手書き'], ['.icns', ['pillow_topview.icns'], 'Pillow'],
    ['.xbm', ['pillow_topview.xbm'], 'Pillow'], ['.xpm', ['handmade_topview.xpm'], '手書き'], ['.wbmp', ['handmade_topview.wbmp'], '手書き'], ['.svg', ['handmade_floorplan.svg'], '手書き'],
  ]],
];
