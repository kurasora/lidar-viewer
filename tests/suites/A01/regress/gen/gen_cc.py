# CloudCompare が書いたファイル（BIN・SBF・ASC・PLY）の試験
#   1) gen() の最初で ../data/cc_src/*.ply（CloudCompare に読ませる元）を書く
#   2) gen_cc_files.sh（heavy の中）で CloudCompare に変換させる → ../data/cc/
#   3) ../data/cc/ にあるファイルについて試験を登録する（まだなければ登録しない）
import os, numpy as np
from common import *
from gen_ply import write_ply, rows_of

SECOND = np.array([0.0, 40.0, 0.0])


def prepare():
    X, Y, Z = P0.T
    write_ply(path('cc_src/basic.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('uchar', 'red'), ('uchar', 'green'), ('uchar', 'blue'), ('float', 'scalar_Intensity')], rows_of(X, Y, Z, RGB0[:, 0], RGB0[:, 1], RGB0[:, 2], I0))])
    Q = P0 + UTM
    write_ply(path('cc_src/utm.ply'), 'binary_little_endian', [('vertex', [('double', 'x'), ('double', 'y'), ('double', 'z'), ('float', 'scalar_Intensity')], rows_of(*Q.T, I0))])
    S2 = P0 + SECOND
    write_ply(path('cc_src/second.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('uchar', 'red'), ('uchar', 'green'), ('uchar', 'blue'), ('float', 'scalar_Intensity')], rows_of(*S2.T, RGB0[:, 0], RGB0[:, 1], RGB0[:, 2], I0))])
    ret = (np.arange(N0) % 3 + 1).astype(float)
    write_ply(path('cc_src/twosf.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('float', 'scalar_Intensity'), ('float', 'scalar_Return')], rows_of(X, Y, Z, I0, ret))])
    write_ply(path('cc_src/sfspace.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('float', 'scalar_Scalar_field')], rows_of(X, Y, Z, I0))])


def have(fn):
    return os.path.exists(path('cc/' + fn))


def gen():
    prepare()
    P32 = f32(P0); Q = P0 + UTM; S2 = f32(P0 + SECOND)
    ret = (np.arange(N0) % 3 + 1).astype(float)
    if have('bin_basic.bin'):
        case('cc/bin_basic', ['cc/bin_basic.bin'], 'CloudCompare の BIN（色 + Intensity）', P=P32, C=RGB0, F={'intensity': I0}, rgb=True)
    if have('bin_utm_shift.bin'):
        case('cc/bin_utm_shift', ['cc/bin_utm_shift.bin'], 'CloudCompare の BIN（UTM、グローバルシフト自動）', P=Q, F={'intensity': I0}, rgb=False, mm=True, tol=2e-5)
    if have('bin_two.bin'):
        case('cc/bin_two', ['cc/bin_two.bin'], 'CloudCompare の BIN（点群 2 つ）', P=np.concatenate([P32, S2]), C=np.concatenate([RGB0, RGB0]), rgb=True)
    if have('bin_local_utm.bin'):
        case('cc/bin_local_utm', ['cc/bin_local_utm.bin'], 'CloudCompare の BIN（ローカルの点群 + UTM の点群、UTM 側だけシフトあり）', P=np.concatenate([P32, Q]), rgb=None, mm=True, tol=2e-5)
    if have('bin_two_sf.bin'):
        case('cc/bin_two_sf', ['cc/bin_two_sf.bin'], 'CloudCompare の BIN（値の欄 2 つ: Intensity, Return）', P=P32, F={'intensity': I0, 'return': ret}, rgb=False)
    if have('sbf_basic.sbf'):
        case('cc/sbf_basic', ['cc/sbf_basic.sbf', 'cc/sbf_basic.sbf.data'], 'CloudCompare の SBF（.sbf + .sbf.data）', P=P32, F={'intensity': I0}, rgb=False)
        case('cc/sbf_basic_dataonly', ['cc/sbf_basic.sbf.data'], 'SBF の .sbf.data だけを選ぶ', P=P32, rgb=False, extra={'note': '.sbf がなくても座標は読める作り'})
        case('cc/sbf_basic_headeronly', ['cc/sbf_basic.sbf'], 'SBF の .sbf だけを選ぶ（.data なし）', error='\\.data', extra={'note': '「.data も一緒に選んで」と知らせる作り'})
    if have('sbf_utm_shift.sbf'):
        case('cc/sbf_utm_shift', ['cc/sbf_utm_shift.sbf', 'cc/sbf_utm_shift.sbf.data'], 'CloudCompare の SBF（UTM、グローバルシフト）', P=Q, F={'intensity': I0}, rgb=False, mm=True, tol=2e-5)
        case('cc/sbf_utm_shift_dataonly', ['cc/sbf_utm_shift.sbf.data'], 'UTM の SBF の .sbf.data だけを選ぶ', P=Q, rgb=False, mm=True, tol=2e-5)
    if have('sbf_two_sf.sbf'):
        case('cc/sbf_two_sf', ['cc/sbf_two_sf.sbf', 'cc/sbf_two_sf.sbf.data'], 'CloudCompare の SBF（値の欄 2 つ）', P=P32, F={'intensity': I0, 'return': ret}, rgb=False)
    if have('asc_sfspace.asc'):
        case('cc/asc_sfspace', ['cc/asc_sfspace.asc'], 'CloudCompare の ASC（見出しつき、値の欄の名前に空白がありうる）', P=P32, rgb=False, extra={'note': '値の欄の名前'})
    if have('ply_utm_shift.ply'):
        case('cc/ply_utm_shift', ['cc/ply_utm_shift.ply'], 'CloudCompare が書いた PLY（UTM をグローバルシフトして読み込んだもの）', P=Q, F={'intensity': I0}, rgb=False, mm=True, tol=2e-5)
    if have('ply_cc_ascii.ply'):
        # CloudCompare の ascii PLY は有効数字 6 桁（20.4123 など）で書くので、10 m 台の座標で 5e-5 m ほど丸まる
        case('cc/ply_cc_ascii', ['cc/ply_cc_ascii.ply'], 'CloudCompare が書いた ascii の PLY', P=P32, C=RGB0, F={'intensity': I0}, rgb=True, tol=1e-4)
