import bpy, bmesh, math
from mathutils import Vector

U = 1/16  # 1 像素 = 1/16 单位

# ---------- 清场 ----------
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for coll in (bpy.data.materials, bpy.data.meshes, bpy.data.actions):
    for d in list(coll): coll.remove(d)

# ======================================================
# 1. 像素材质：按像素格抖动 + 竖条纹 + 离散色阶
# ======================================================
def pixel_mat(name, base, dark, light, grain=0.5, cell=(1,1,1), bands=(0.38,0.66)):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    N, L = mat.node_tree.nodes, mat.node_tree.links; N.clear()

    bsdf = N.new('ShaderNodeBsdfPrincipled'); bsdf.location = (0,0)
    bsdf.inputs['Roughness'].default_value = 1.0
    for k in ('Specular', 'Specular IOR Level'):          # 2.8~4.x 兼容
        if k in bsdf.inputs: bsdf.inputs[k].default_value = 0.0
    out = N.new('ShaderNodeOutputMaterial'); out.location = (300,0)
    L.new(bsdf.outputs[0], out.inputs[0])

    tc   = N.new('ShaderNodeTexCoord')
    snap = N.new('ShaderNodeVectorMath'); snap.operation = 'SNAP'
    snap.inputs[1].default_value = tuple(c*U for c in cell)   # 格子尺寸(像素)，Z 拉长 = 竖毛纹
    wn   = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
    nz   = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 4.0
    nz.inputs['Detail'].default_value = 0.0
    m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY';     m1.inputs[1].default_value = 1-grain
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY_ADD'; m2.inputs[1].default_value = grain
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'                     # 离散色阶 → 像素画感
    cr.elements[0].position = 0;        cr.elements[0].color = (*dark, 1)
    cr.elements[1].position = bands[1]; cr.elements[1].color = (*light, 1)
    cr.elements.new(bands[0]).color = (*base, 1)

    L.new(tc.outputs['Object'], snap.inputs[0])
    L.new(snap.outputs[0], wn.inputs['Vector']); L.new(snap.outputs[0], nz.inputs['Vector'])
    L.new(nz.outputs['Fac'], m1.inputs[0]); L.new(m1.outputs[0], m2.inputs[2])
    L.new(wn.outputs['Value'], m2.inputs[0]); L.new(m2.outputs[0], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], bsdf.inputs[0])
    mat.diffuse_color = (*base, 1)
    return mat

M = {
 'body'    : pixel_mat('Bull_Body',    (0.23,0.13,0.06),(0.11,0.06,0.025),(0.36,0.22,0.11), .6, (1,1,3)),
 'dark'    : pixel_mat('Bull_Dark',    (0.15,0.085,0.04),(0.07,0.04,0.015),(0.25,0.15,0.07), .6, (1,1,3)),
 'muzzle'  : pixel_mat('Bull_Muzzle',  (0.40,0.27,0.16),(0.28,0.17,0.09),(0.50,0.36,0.23)),
 'horn'    : pixel_mat('Bull_Horn',    (0.88,0.85,0.75),(0.66,0.62,0.53),(0.97,0.96,0.92), .4, (3,1,1)),
 'hornbase': pixel_mat('Bull_HornBase',(0.55,0.47,0.36),(0.40,0.33,0.24),(0.70,0.63,0.52), .4, (3,1,1)),
 'hoof'    : pixel_mat('Bull_Hoof',    (0.72,0.58,0.55),(0.55,0.42,0.40),(0.85,0.72,0.70)),
 'white'   : pixel_mat('Bull_White',   (0.95,0.95,0.95),(0.88,0.88,0.88),(1,1,1), .2),
 'black'   : pixel_mat('Bull_Black',   (0.04,0.03,0.03),(0.02,0.02,0.02),(0.08,0.07,0.07), .2),
}

# ======================================================
# 2. 通用建网格 / 语义方块
# ======================================================
BOX_F = [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]

def new_obj(name, V, F, mat, loc, rot_euler=(0,0,0), parent=None):
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.materials.append(M[mat])
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot_euler
    if parent:
        p = bpy.data.objects[parent]; bpy.context.view_layer.update()
        o.parent = p; o.matrix_parent_inverse = p.matrix_world.inverted()
    return o

def make_box(spec):
    size, loc = spec['size'], Vector(spec['loc'])
    pivot = Vector(spec.get('pivot', spec['loc']))
    sx, sy, sz = [s*U for s in size]
    V = [Vector((x*sx, y*sy, z*sz)) for x in (-.5,.5) for y in (-.5,.5) for z in (-.5,.5)]
    for kind, axis, amt in spec.get('shape', []):
        ai = 'xyz'.index(axis[-1]); sgn = -1 if axis[0]=='-' else 1
        for v in V:
            if kind == 'taper':     # axis 端收窄 amt(0~1)
                t = v[ai]*sgn/(size[ai]*U) + 0.5; k = 1 - amt*t
                for j in range(3):
                    if j != ai: v[j] *= k
            elif kind == 'slope':   # axis 端顶面压低 amt 像素
                if v[ai]*sgn > 0 and v.z > 0: v.z -= amt*U
            elif kind == 'shear':   # 顶面沿 axis 平移 amt 像素
                if v.z > 0: v[ai] += amt*U*sgn
    for v in V: v += (loc - pivot)*U
    return new_obj(spec['name'], V, BOX_F, spec['mat'], pivot*U,
                   [math.radians(a) for a in spec.get('rot',(0,0,0))], spec.get('parent'))

def make_segment(name, a, b, r0, r1, mat, parent, overlap=0.4):
    """从 a 到 b 的一段方柱（像素坐标），截面半径 r0→r1，用来拼弯角"""
    a, b = Vector(a), Vector(b); d = b - a; Ln = d.length
    V = [Vector((x, y, z))*U for x, r in ((-overlap, r0), (Ln+overlap, r1))
                                for y in (-r, r) for z in (-r, r)]
    return new_obj(name, V, BOX_F, mat, a*U, d.to_track_quat('X','Z').to_euler(), parent)

# ======================================================
# 3. 零件表（像素单位，+Y 朝前，Z 向上，地面 z=0）
# ======================================================
PARTS = [
 dict(name="Body",  size=(14,24,13), loc=(0,0,16),     mat='body', shape=[('taper','-y',0.06)]),
 dict(name="Hump",  size=(12,9,4),   loc=(0,6.5,24.5), mat='dark', shape=[('slope','-y',3)]),
 dict(name="Neck",  size=(9,5,9),    loc=(0,13.5,17.5),mat='body'),
 dict(name="Head",  size=(9,9,9),    loc=(0,19,15.5),  mat='body', pivot=(0,14,20), rot=(-5,0,0)),
 dict(name="Muzzle",size=(7,4,6),    loc=(0,25.3,14),  mat='muzzle', parent="Head"),
 dict(name="Brow",  size=(8,.4,1.2), loc=(0,23.6,19.4),mat='dark',   parent="Head"),
 dict(name="Eye_L",   size=(2.5,.4,2.5), loc=( 2.5,23.6,18.2), mat='white', parent="Head"),
 dict(name="Eye_R",   size=(2.5,.4,2.5), loc=(-2.5,23.6,18.2), mat='white', parent="Head"),
 dict(name="Pupil_L", size=(1.2,.4,1.4), loc=( 1.9,23.8,18.1), mat='black', parent="Head"),
 dict(name="Pupil_R", size=(1.2,.4,1.4), loc=(-1.9,23.8,18.1), mat='black', parent="Head"),
 dict(name="Nostril_L", size=(1.4,.4,1.4), loc=( 1.8,27.6,15.5), mat='black', parent="Head"),
 dict(name="Nostril_R", size=(1.4,.4,1.4), loc=(-1.8,27.6,15.5), mat='black', parent="Head"),
 dict(name="Mouth",     size=(5,.4,.8),    loc=(0,27.6,11.8),    mat='black', parent="Head"),
 dict(name="Ear_L", size=(3,1.5,2), loc=( 5.5,17.5,17.5), mat='muzzle', parent="Head", rot=(0,-25,0)),
 dict(name="Ear_R", size=(3,1.5,2), loc=(-5.5,17.5,17.5), mat='muzzle', parent="Head", rot=(0, 25,0)),
 dict(name="Tail",    size=(2,2,9), loc=(0,-12.5,18), pivot=(0,-12,22.5), mat='dark', rot=(-10,0,0)),
 dict(name="TailTip", size=(3,3,3), loc=(0,-12.5,12.5), mat='black', parent="Tail"),
]
for x, y, n in ((4.5,8,'FL'), (-4.5,8,'FR'), (4.5,-8,'BL'), (-4.5,-8,'BR')):
    PARTS.append(dict(name=f"Leg_{n}",  size=(5,5,10),    loc=(x,y,5), pivot=(x,y,10), mat='body'))
    PARTS.append(dict(name=f"Hoof_{n}", size=(5.2,5.2,2), loc=(x,y,1), mat='hoof', parent=f"Leg_{n}"))

root = bpy.data.objects.new("Bull", None); bpy.context.collection.objects.link(root)
objs = {}
for spec in PARTS:
    o = make_box(spec); objs[o.name] = o
    if 'parent' not in spec: o.parent = root

# 牛角：3 段方柱链，向外→向前→向上弯（左右镜像）
HORN = [(3.5,19.5,18.5), (8.5,20.5,19.5), (12.5,23,21.5), (14.5,27,24.5)]
HORN_R = [1.6, 1.4, 1.0, 0.3]
for side, sgn in (('L',1), ('R',-1)):
    for i in range(3):
        a = (HORN[i][0]*sgn, HORN[i][1], HORN[i][2]); b = (HORN[i+1][0]*sgn, HORN[i+1][1], HORN[i+1][2])
        o = make_segment(f"Horn_{side}{i}", a, b, HORN_R[i], HORN_R[i+1],
                         'hornbase' if i == 0 else 'horn', "Head")
        objs[o.name] = o

# ======================================================
# 4. 无骨骼循环 walk 动画
# ======================================================
sc = bpy.context.scene; sc.frame_start, sc.frame_end = 1, 24
def key(o, f, rx=None, ry=None, z=None):
    if rx is not None: o.rotation_euler.x = math.radians(rx)
    if ry is not None: o.rotation_euler.y = math.radians(ry)
    if rx is not None or ry is not None: o.keyframe_insert("rotation_euler", frame=f)
    if z is not None: o.location.z = z*U; o.keyframe_insert("location", frame=f)

for n, ph in (("FL",0), ("BR",0), ("FR",12), ("BL",12)):          # 对角腿同相
    o = objs[f"Leg_{n}"]; key(o,1+ph,rx=-22); key(o,13+ph,rx=22); key(o,25+ph,rx=-22)
h = objs["Head"]; key(h,1,rx=-5); key(h,13,rx=-11); key(h,25,rx=-5)   # 点头
t = objs["Tail"]; key(t,1,ry=-12); key(t,13,ry=12); key(t,25,ry=-12)   # 甩尾
for f, z in ((1,0),(7,.6),(13,0),(19,.6),(25,0)): key(root, f, z=z)   # 身体颠簸(2 次/周期)
for a in bpy.data.actions:
    for fc in a.fcurves: fc.modifiers.new('CYCLES')

# ======================================================
# 5. 场景观感：阳光 + 视口切 Material Preview
# ======================================================
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN'))
bpy.context.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(30))
sun.data.energy = 3
if bpy.context.screen:
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for sp in area.spaces:
                if sp.type == 'VIEW_3D': sp.shading.type = 'MATERIAL'

root.select_set(True); bpy.context.view_layer.objects.active = root
print("Bull voxel model created.")