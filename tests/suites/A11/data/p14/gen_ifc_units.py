# 同じ形（柱 1 本と壁 1 枚、はっきり非対称な位置）を、長さの単位 m と mm の IFC で書く
import ifcopenshell, ifcopenshell.api, numpy as np, math, sys
run = ifcopenshell.api.run
def make(path, raw):
    f = run('project.create_file', version='IFC4')
    proj = run('root.create_entity', f, ifc_class='IfcProject', name='U')
    run('unit.assign_unit', f, length={'is_metric': True, 'raw': raw})
    ctx = run('context.add_context', f, context_type='Model')
    body = run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=ctx)
    site = run('root.create_entity', f, ifc_class='IfcSite', name='S'); bld = run('root.create_entity', f, ifc_class='IfcBuilding', name='B'); st = run('root.create_entity', f, ifc_class='IfcBuildingStorey', name='1F')
    run('aggregate.assign_object', f, relating_object=proj, products=[site]); run('aggregate.assign_object', f, relating_object=site, products=[bld]); run('aggregate.assign_object', f, relating_object=bld, products=[st])
    def place(el, x, y, z, rz=0.0):
        M = np.eye(4); c, s = math.cos(rz), math.sin(rz); M[:3, :3] = [[c, -s, 0], [s, c, 0], [0, 0, 1]]; M[:3, 3] = [x, y, z]
        run('geometry.edit_object_placement', f, product=el, matrix=M)
    w = run('root.create_entity', f, ifc_class='IfcWall', name='W')
    rep = run('geometry.add_wall_representation', f, context=body, length=8.0, height=3.0, thickness=0.3)
    run('geometry.assign_representation', f, product=w, representation=rep); place(w, 2.0, 7.0, 0.5, math.radians(30))
    run('spatial.assign_container', f, relating_structure=st, products=[w])
    c = run('root.create_entity', f, ifc_class='IfcColumn', name='C')
    prof = f.create_entity('IfcCircleProfileDef', ProfileType='AREA', Radius=0.25)
    rep = run('geometry.add_profile_representation', f, context=body, profile=prof, depth=4.0)
    run('geometry.assign_representation', f, product=c, representation=rep); place(c, -5.0, -3.0, 1.0)
    run('spatial.assign_container', f, relating_structure=st, products=[c])
    f.write(path)
make('units_m.ifc', 'METERS'); make('units_mm.ifc', 'MILLIMETERS')
