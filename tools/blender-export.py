# Blender batch script: import any model Blender understands (.blend .fbx .obj .dae .gltf/.glb .3ds .stl .ply .usd),
# optionally decimate, and export a single GLB with packed textures.
# Run via tools/convert-any.mjs or directly:
#   "/Volumes/vlikcc/Applications/Blender.app/Contents/MacOS/Blender" -b --python tools/blender-export.py -- <input> <output.glb> [decimate_ratio] [target_height_m]
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print('usage: blender -b --python blender-export.py -- <input> <output.glb> [decimate_ratio=1] [target_height_m=0]'); sys.exit(2)
src, dst = os.path.abspath(argv[0]), os.path.abspath(argv[1])
ratio = float(argv[2]) if len(argv) > 2 else 1.0
target_h = float(argv[3]) if len(argv) > 3 else 0.0
ext = os.path.splitext(src)[1].lower()

if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
    elif ext == '.dae': bpy.ops.wm.collada_import(filepath=src)
    elif ext in ('.gltf', '.glb'): bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.stl': bpy.ops.wm.stl_import(filepath=src)
    elif ext == '.ply': bpy.ops.wm.ply_import(filepath=src)
    elif ext in ('.usd', '.usda', '.usdc', '.usdz'): bpy.ops.wm.usd_import(filepath=src)
    elif ext == '.3ds':
        try: bpy.ops.import_scene.autodesk_3ds(filepath=src)
        except Exception as e: print('3DS import needs the "Autodesk 3DS format" extension enabled in Blender:', e); sys.exit(3)
    else: print('unsupported input', ext); sys.exit(2)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes: print('no mesh objects found'); sys.exit(4)
# drop lights/cameras so the GLB only carries geometry
for o in list(bpy.context.scene.objects):
    if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)

# apply transforms, decimate
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
tris_before = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
if ratio < 1.0:
    for o in meshes:
        m = o.modifiers.new('Decimate', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
tris_after = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)

# normalise: base on y=0 (glTF is Y-up; Blender Z-up → exporter converts), optional uniform scale to target height
import mathutils
xs, ys, zs = [], [], []
for o in meshes:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v); xs.append(w.x); ys.append(w.y); zs.append(w.z)
height = (max(zs) - min(zs)) or 1.0
scale = (target_h / height) if target_h > 0 else 1.0
for o in meshes:
    if o.parent is None:
        o.location = (o.location.x * scale, o.location.y * scale, (o.location.z - min(zs)) * scale)
        o.scale = (o.scale.x * scale, o.scale.y * scale, o.scale.z * scale)

bpy.ops.file.pack_all()
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=85, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, use_selection=False)
print(f'EXPORTED {dst}: {tris_before} → {tris_after} tris, height {height*scale:.2f} m')
