"""kOSBlocks simulator: a small kerboscript interpreter + 2D point-mass physics over Kerbin.
Usable in Pyodide (browser) or plain CPython.  API:  run(code, vessel, **opts) -> SimResult"""
import math, re, json

R_KERBIN = 600000.0
MU = 3.5316e12
G0 = 9.80665
ROT_SPEED = 174.94                  # m/s at equator
OMEGA = ROT_SPEED / R_KERBIN
ATM_H = 70000.0
SCALE_H = 5600.0
RHO0 = 1.225
SOI = 84159286.0
LNG0 = -74.5577                     # KSC longitude

class KosError(Exception): pass
class ParseError(Exception): pass
class _Return(Exception):
    def __init__(self, v): self.v = v
class _Break(Exception): pass

# ----------------------------------------------------------------- values
class Vec:
    __slots__ = ('x', 'y')
    def __init__(self, x, y): self.x, self.y = float(x), float(y)
    def mag(self): return math.hypot(self.x, self.y)
    def norm(self):
        m = self.mag()
        return Vec(self.x / m, self.y / m) if m > 1e-12 else Vec(0, 0)
    def __add__(s, o): return Vec(s.x + o.x, s.y + o.y)
    def __sub__(s, o): return Vec(s.x - o.x, s.y - o.y)
    def __mul__(s, k): return Vec(s.x * k, s.y * k)
    __rmul__ = __mul__
    def __neg__(s): return Vec(-s.x, -s.y)
    def dot(s, o): return s.x * o.x + s.y * o.y
    def suffix(self, name, args, sim):
        if name in ('mag',): return self.mag()
        if name in ('normalized', 'vector', 'forevector'): return self.norm()
        if name == 'x': return self.x
        if name == 'y': return self.y
        if name == 'z': return 0.0
        if name == 'sqrmagnitude': return self.mag() ** 2
        raise KosError(f"Vector has no suffix :{name.upper()}")
    def __repr__(self): return f"V({self.x:.3f}, {self.y:.3f}, 0)"

class LatLng:
    def __init__(self, lat, lng): self.lat, self.lng = float(lat), float(lng)
    def suffix(self, name, args, sim):
        if name == 'lat': return self.lat
        if name == 'lng': return self.lng
        if name == 'terrainheight': return 0.0
        dl = (self.lng - sim.longitude() + 540) % 360 - 180
        if name == 'heading': return 90.0 if dl >= 0 else 270.0
        if name == 'distance': return abs(math.radians(dl)) * R_KERBIN
        if name == 'bearing': return 0.0 if abs(dl) < 1e-9 else (90.0 if dl > 0 else -90.0)
        raise KosError(f"GeoCoordinates has no suffix :{name.upper()}")
    def __repr__(self): return f"LATLNG({self.lat:.4f}, {self.lng:.4f})"

class LockVal:
    __slots__ = ('ast',)
    def __init__(self, ast): self.ast = ast

def kstr(v):
    if isinstance(v, bool): return 'True' if v else 'False'
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e15: return str(int(v))
        return f"{v:.10g}"
    return str(v)

# ----------------------------------------------------------------- lexer
TOKRE = re.compile(r'(?P<ws>\s+)|(?P<com>//[^\n]*)|(?P<num>\d+\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)|(?P<str>"[^"]*")|(?P<id>[A-Za-z_]\w*)|(?P<op><=|>=|<>|[-+*/^<>=(){}\[\],:.#@])')
def lex(src):
    toks, line, pos = [], 1, 0
    while pos < len(src):
        m = TOKRE.match(src, pos)
        if not m:
            toks.append(('bad', src[pos], line)); pos += 1; continue
        k = m.lastgroup; v = m.group(k)
        if k == 'num': toks.append(('num', float(v), line))
        elif k == 'str': toks.append(('str', v[1:-1], line))
        elif k == 'id': toks.append(('id', v.lower(), line))
        elif k == 'op': toks.append(('op', v, line))
        line += v.count('\n'); pos = m.end()
    toks.append(('eof', None, line))
    return toks

TOGGLES = {'sas', 'rcs', 'gear', 'brakes', 'lights', 'legs', 'panels', 'abort', 'chutes', 'chutessafe',
           'radiators', 'ladders', 'bays', 'deploydrills', 'drills', 'fuelcells', 'isru', 'intakes'} | {f'ag{i}' for i in range(1, 11)}
UNSUPPORTED = {'run', 'runpath', 'runoncepath', 'switch', 'copypath', 'movepath', 'deletepath', 'log', 'edit',
               'list', 'on', 'toggle', 'reboot', 'shutdown', 'for', 'add', 'remove', 'rename', 'compile', 'unset'}

class Parser:
    def __init__(self, src, warn):
        self.t = lex(src); self.i = 0; self.warn = warn
    def peek(self, o=0): return self.t[min(self.i + o, len(self.t) - 1)]
    def nxt(self):
        t = self.t[self.i]; self.i = min(self.i + 1, len(self.t) - 1); return t
    def isop(self, v, o=0): t = self.peek(o); return t[0] == 'op' and t[1] == v
    def isid(self, v, o=0): t = self.peek(o); return t[0] == 'id' and t[1] == v
    def expect_op(self, v):
        t = self.nxt()
        if not (t[0] == 'op' and t[1] == v): raise ParseError(f"line {t[2]}: expected '{v}' but found '{t[1]}'")
    def expect_id(self, v=None):
        t = self.nxt()
        if t[0] != 'id' or (v and t[1] != v): raise ParseError(f"line {t[2]}: expected {v.upper() if v else 'a name'} but found '{t[1]}'")
        return t[1]
    def end(self):
        if self.isop('.'): self.nxt(); return
        self.warn(f"line {self.peek()[2]}: missing period '.' at end of statement")

    def program(self):
        out = []
        while self.peek()[0] != 'eof':
            if self.isop('}'):
                self.warn(f"line {self.peek()[2]}: unexpected '}}'"); self.nxt(); continue
            s = self.safe_statement()
            if s: out.append(s)
        return out
    def block(self):
        self.expect_op('{'); out = []
        while not self.isop('}'):
            if self.peek()[0] == 'eof': raise ParseError("unclosed '{' at end of file")
            s = self.safe_statement()
            if s: out.append(s)
        self.nxt(); return ('block', out)
    def safe_statement(self):
        start = self.i; line = self.peek()[2]
        try:
            return self.statement()
        except ParseError as e:
            self.warn(f"parse error {e} – statement skipped")
            self.i = start; depth = 0
            while self.peek()[0] != 'eof':
                t = self.nxt()
                if t[0] == 'op' and t[1] == '{': depth += 1
                elif t[0] == 'op' and t[1] == '}':
                    depth -= 1
                    if depth <= 0: break
                elif t[0] == 'op' and t[1] == '.' and depth == 0: break
            if self.i == start: self.nxt()
            return None
    def target(self):
        parts = [self.expect_id()]
        while self.isop(':'): self.nxt(); parts.append(self.expect_id())
        return ':'.join(parts)
    def statement(self):
        t = self.peek(); line = t[2]
        if t[0] == 'op' and t[1] == '{': return self.block()
        if t[0] == 'op' and t[1] == '@':
            while not self.isop('.') and self.peek()[0] != 'eof': self.nxt()
            self.nxt(); return None
        if t[0] != 'id':
            e = self.expr(); self.end(); return ('expr', e, line)
        kw = t[1]
        if kw == 'set':
            self.nxt(); tg = self.target(); self.expect_id('to'); e = self.expr(); self.end(); return ('set', tg, e, line)
        if kw == 'lock':
            self.nxt(); tg = self.target(); self.expect_id('to'); e = self.expr(); self.end(); return ('lock', tg, e, line)
        if kw == 'unlock':
            self.nxt(); tg = self.target(); self.end(); return ('unlock', tg, line)
        if kw == 'declare':
            self.nxt()
            if self.isid('global') or self.isid('local'): self.nxt()
            if self.isid('function'): return self.statement()
            if self.isid('parameter'): return self.statement()
            n = self.expect_id(); self.nxt(); e = self.expr(); self.end(); return ('local', n, e, line)
        if kw in ('local', 'global'):
            self.nxt()
            if self.isid('function'): return self.statement()
            if self.isid('lock'):
                return self.statement()
            n = self.expect_id()
            if not (self.isid('is') or self.isid('to')): raise ParseError(f"line {line}: expected IS after {kw.upper()} {n}")
            self.nxt(); e = self.expr(); self.end(); return ('local' if kw == 'local' else 'set', n, e, line)
        if kw == 'function':
            self.nxt(); n = self.expect_id(); b = self.block(); return ('func', n, b, line)
        if kw == 'parameter':
            self.nxt(); names = []
            while True:
                n = self.expect_id(); d = None
                if self.isid('is'): self.nxt(); d = self.expr()
                names.append((n, d))
                if self.isop(','): self.nxt(); continue
                break
            self.end(); return ('param', names, line)
        if kw == 'return':
            self.nxt(); e = None
            if not self.isop('.') and not self.isop('}'): e = self.expr()
            self.end(); return ('return', e, line)
        if kw == 'if':
            self.nxt(); c = self.expr(); b = self.stmt_or_block(); eb = None
            if self.isid('else'):
                self.nxt(); eb = self.stmt_or_block()
            if self.isop('.'): self.nxt()
            return ('if', c, b, eb, line)
        if kw == 'until':
            self.nxt(); c = self.expr(); b = self.block(); return ('until', c, b, line)
        if kw == 'from':
            self.nxt(); init = self.block(); self.expect_id('until'); c = self.expr()
            self.expect_id('step'); step = self.block(); self.expect_id('do'); b = self.block()
            return ('from', init, c, step, b, line)
        if kw == 'when':
            self.nxt(); c = self.expr(); self.expect_id('then'); b = self.stmt_or_block(); return ('when', c, b, line)
        if kw == 'wait':
            self.nxt()
            if self.isid('until'):
                self.nxt(); c = self.expr(); self.end(); return ('waituntil', c, line)
            e = self.expr(); self.end(); return ('wait', e, line)
        if kw == 'print':
            self.nxt(); e = self.expr(); at = None
            if self.isid('at'):
                self.nxt(); self.expect_op('('); c = self.expr(); self.expect_op(','); r = self.expr(); self.expect_op(')'); at = (c, r)
            self.end(); return ('print', e, at, line)
        if kw in ('clearscreen', 'stage', 'preserve', 'break'):
            self.nxt(); self.end(); return (kw, line)
        if kw in TOGGLES and (self.isid('on', 1) or self.isid('off', 1)):
            self.nxt(); v = self.nxt()[1] == 'on'; self.end(); return ('toggle', kw, v, line)
        if kw in UNSUPPORTED and not self.isop('(', 1) or kw in ('runpath', 'runoncepath', 'switch', 'copypath'):
            toks = []
            depth = 0
            while self.peek()[0] != 'eof':
                tk = self.peek()
                if tk[0] == 'op' and tk[1] == '{': depth += 1
                if tk[0] == 'op' and tk[1] == '}':
                    if depth == 0: break
                    depth -= 1
                self.nxt()
                if tk[0] == 'op' and tk[1] == '.' and depth == 0: break
                toks.append(str(tk[1]))
            return ('unsupported', ' '.join(toks), line)
        e = self.expr()
        if self.isid('on') or self.isid('off'):
            v = self.nxt()[1] == 'on'; self.end(); return ('toggle', '?', v, line)
        self.end(); return ('expr', e, line)
    def stmt_or_block(self):
        if self.isop('{'): return self.block()
        s = self.statement(); return ('block', [s] if s else [])
    # expressions
    def expr(self): return self.p_or()
    def p_or(self):
        a = self.p_and()
        while self.isid('or'): self.nxt(); a = ('or', a, self.p_and())
        return a
    def p_and(self):
        a = self.p_not()
        while self.isid('and'): self.nxt(); a = ('and', a, self.p_not())
        return a
    def p_not(self):
        if self.isid('not'): self.nxt(); return ('not', self.p_not())
        return self.p_cmp()
    def p_cmp(self):
        a = self.p_add()
        t = self.peek()
        if t[0] == 'op' and t[1] in ('<', '>', '<=', '>=', '=', '<>'):
            self.nxt(); return ('bin', t[1], a, self.p_add())
        return a
    def p_add(self):
        a = self.p_mul()
        while self.peek()[0] == 'op' and self.peek()[1] in '+-' and self.peek()[1] != '':
            op = self.nxt()[1]; a = ('bin', op, a, self.p_mul())
        return a
    def p_mul(self):
        a = self.p_unary()
        while self.peek()[0] == 'op' and self.peek()[1] in ('*', '/'):
            op = self.nxt()[1]; a = ('bin', op, a, self.p_unary())
        return a
    def p_unary(self):
        if self.isop('-'): self.nxt(); return ('neg', self.p_unary())
        if self.isop('+'): self.nxt(); return self.p_unary()
        return self.p_pow()
    def p_pow(self):
        a = self.p_post()
        if self.isop('^'): self.nxt(); return ('bin', '^', a, self.p_unary())
        return a
    def args(self):
        self.expect_op('('); out = []
        if not self.isop(')'):
            out.append(self.expr())
            while self.isop(','): self.nxt(); out.append(self.expr())
        self.expect_op(')'); return out
    def p_post(self):
        t = self.peek()
        if t[0] == 'num': self.nxt(); return ('num', t[1])
        if t[0] == 'str': self.nxt(); return ('str', t[1])
        if t[0] == 'op' and t[1] == '(':
            self.nxt(); e = self.expr(); self.expect_op(')'); return self.suffixes(e)
        if t[0] == 'id':
            self.nxt()
            if t[1] in ('true', 'false') and not self.isop(':'): return ('num', t[1] == 'true')
            parts = [(t[1], self.args() if self.isop('(') else None)]
            while self.isop(':') and self.peek(1)[0] == 'id':
                self.nxt(); n = self.nxt()[1]; parts.append((n, self.args() if self.isop('(') else None))
            return ('chain', parts, t[2])
        raise ParseError(f"line {t[2]}: unexpected '{t[1]}' in expression")
    def suffixes(self, e):
        parts = []
        while self.isop(':') and self.peek(1)[0] == 'id':
            self.nxt(); n = self.nxt()[1]; parts.append((n, self.args() if self.isop('(') else None))
        return ('suffix', e, parts) if parts else e

# ----------------------------------------------------------------- simulator
DEFAULT_VESSEL = {
    "name": "Kerbal X-lite",
    "stages": [
        {"name": "Booster", "wet": 18.0, "dry": 2.5, "thrust_vac": 330, "thrust_sl": 300, "isp_vac": 310, "isp_sl": 270, "cda": 4.0},
        {"name": "Upper", "wet": 6.0, "dry": 1.5, "thrust_vac": 60, "thrust_sl": 15, "isp_vac": 345, "isp_sl": 85, "cda": 0.6},
    ],
    "start": {"mode": "pad", "alt": 0, "vx": 0, "vy": 0, "active": False},
    "rotation": True, "turn_rate": 12.0, "tmax": 1800.0, "dt": 0.05, "coast_after_end": True,
}

class Sim:
    def __init__(self, code, vessel=None, **opts):
        v = json.loads(json.dumps(vessel or DEFAULT_VESSEL))
        for k, d in DEFAULT_VESSEL.items(): v.setdefault(k, d)
        v.update(opts)
        self.cfg = v
        self.warnings = []
        self.code = code
        self.dt = float(v['dt']); self.tmax = float(v['tmax'])
        self.omega = OMEGA if v.get('rotation', True) else 0.0
        self.turn_rate = math.radians(float(v['turn_rate']))
        self.stages = [dict(s, fuel=max(0.0, float(s['wet']) - float(s['dry']))) for s in v['stages']]
        st = v['start']
        alt = float(st.get('alt', 0) or 0)
        self.pos = Vec(R_KERBIN + alt, 0)
        up = Vec(1, 0); east = Vec(0, 1)
        self.vel = self.rotv(self.pos) + up * float(st.get('vy', 0) or 0) + east * float(st.get('vx', 0) or 0)
        self.active = 0 if (st.get('active') or st.get('mode') == 'air') and self.stages else -1
        self.attached = 0
        self.t = 0.0
        self.throttle = 0.0; self.pilot_throttle = 0.0
        self.landed = alt <= 0.5; self.flown = False; self.landed_since = None
        vs = self.vel - self.rotv(self.pos)
        self.facing = (-vs).norm() if (st.get('mode') == 'air' and vs.mag() > 1) else up
        self.flags = {k: False for k in TOGGLES}
        self.dv_used = 0.0; self.max_alt = alt; self.max_speed = 0.0; self.max_q = 0.0
        self.log = []; self.screen = [''] * 36; self.cursor = 0
        self.series = {k: [] for k in ('t', 'alt', 'speed', 'orbit_speed', 'throttle', 'mass', 'x', 'y', 'ap', 'pe')}
        self.events = []
        self.outcome = None; self.error = None; self.program_done = False; self.done_reason = ''
        self._orb = None
        # interpreter state
        self.globals = {}
        self.funcs = {}
        self.locks = {}          # steering / throttle
        self.triggers = []       # [cond, body, line]
        self.ops = 0
        self._warned = set()

    # ---- helpers
    def warn(self, msg):
        if msg not in self._warned:
            self._warned.add(msg); self.warnings.append(msg)
    def rotv(self, p): return Vec(-p.y * self.omega, p.x * self.omega)
    def up(self): return self.pos.norm()
    def east(self): u = self.up(); return Vec(-u.y, u.x)
    def altitude(self): return self.pos.mag() - R_KERBIN
    def srfvel(self): return self.vel - self.rotv(self.pos)
    def longitude(self):
        th = math.degrees(math.atan2(self.pos.y, self.pos.x) - self.omega * self.t)
        return (th + LNG0 + 540) % 360 - 180
    def pressure(self):
        h = self.altitude()
        return 0.0 if h >= ATM_H else math.exp(-max(h, 0) / SCALE_H) * (1 - max(h, 0) / ATM_H) ** 0.3
    def mass(self): return sum(s['dry'] + s['fuel'] for s in self.stages[self.attached:]) or 0.001
    def cur_stage(self):
        return self.stages[self.active] if 0 <= self.active < len(self.stages) else None
    def maxthrust(self):
        s = self.cur_stage()
        if not s or s['fuel'] <= 1e-9: return 0.0
        p = self.pressure()
        return s['thrust_vac'] + (s['thrust_sl'] - s['thrust_vac']) * p
    def isp(self):
        s = self.cur_stage(); p = self.pressure()
        return s['isp_vac'] + (s['isp_sl'] - s['isp_vac']) * p
    def stagenum(self):
        return len(self.stages) if self.active < 0 else max(0, len(self.stages) - self.active - 1)
    def do_stage(self):
        if self.active < 0:
            self.active = 0
        elif self.active + 1 < len(self.stages):
            self.attached = self.active + 1; self.active += 1
        else:
            self.warn(f"STAGE called but no stages left (t={self.t:.1f}s)"); return
        self.events.append((self.t, f"STAGE → {self.stages[self.active]['name']}"))
    def orbit(self):
        if self._orb is not None: return self._orb
        r = self.pos.mag(); v2 = self.vel.dot(self.vel)
        eps = v2 / 2 - MU / r
        h = self.pos.x * self.vel.y - self.pos.y * self.vel.x
        e = math.sqrt(max(0.0, 1 + 2 * eps * h * h / MU ** 2))
        o = {'e': e}
        if eps < 0:
            a = -MU / (2 * eps)
            o.update(a=a, ap=a * (1 + e) - R_KERBIN, pe=a * (1 - e) - R_KERBIN)
            n = math.sqrt(MU / a ** 3); o['period'] = 2 * math.pi / n
            if e > 1e-9:
                cosnu = max(-1.0, min(1.0, (a * (1 - e * e) / r - 1) / e))
                nu = math.acos(cosnu)
                if self.pos.dot(self.vel) < 0: nu = 2 * math.pi - nu
                E = 2 * math.atan(math.sqrt((1 - e) / (1 + e)) * math.tan(nu / 2))
                M = (E - e * math.sin(E)) % (2 * math.pi)
            else:
                M = 0.0
            o['eta_ap'] = ((math.pi - M) % (2 * math.pi)) / n
            o['eta_pe'] = ((2 * math.pi - M) % (2 * math.pi)) / n
        else:
            a = -MU / (2 * eps) if eps != 0 else -1e30
            o.update(a=a, ap=-1.0, pe=(a * (1 - e) - R_KERBIN), period=float('inf'), eta_ap=float('inf'), eta_pe=0.0)
        self._orb = o; return o
    def status(self):
        if self.outcome == 'CRASHED': return 'CRASHED'
        if self.landed: return 'LANDED' if self.flown else 'PRELAUNCH'
        h = self.altitude(); o = self.orbit()
        if o['ap'] < 0: return 'ESCAPING'
        if h < ATM_H: return 'FLYING'
        return 'ORBITING' if o['pe'] > ATM_H else 'SUB_ORBITAL'
    def heading_vec(self, hdg, pitch):
        u, e = self.up(), self.east()
        p, hd = math.radians(pitch), math.radians(hdg)
        v = u * math.sin(p) + e * (math.cos(p) * math.sin(hd))
        if v.mag() < 1e-6:
            self.warn("HEADING points north/south: out of the simulated 2D plane – holding attitude")
            return self.facing
        return v.norm()

    # ---- telemetry table
    def tele(self, path):
        p = path
        if p.startswith('ship:') and p != 'ship': p = p[5:]
        p = p.replace('obt:', 'orbit:')
        o = None
        T = {
            'altitude': lambda: self.altitude(), 'alt:radar': lambda: self.altitude(),
            'apoapsis': lambda: self.orbit()['ap'], 'periapsis': lambda: self.orbit()['pe'],
            'alt:apoapsis': lambda: self.orbit()['ap'], 'alt:periapsis': lambda: self.orbit()['pe'],
            'orbit:apoapsis': lambda: self.orbit()['ap'], 'orbit:periapsis': lambda: self.orbit()['pe'],
            'orbit:semimajoraxis': lambda: self.orbit()['a'], 'orbit:eccentricity': lambda: self.orbit()['e'],
            'orbit:period': lambda: self.orbit()['period'], 'orbit:eta:apoapsis': lambda: self.orbit()['eta_ap'],
            'eta:apoapsis': lambda: self.orbit()['eta_ap'], 'eta:periapsis': lambda: self.orbit()['eta_pe'],
            'orbit:body:mu': lambda: MU,
            'verticalspeed': lambda: self.vel.dot(self.up()),
            'groundspeed': lambda: abs(self.srfvel().dot(self.east())),
            'airspeed': lambda: self.srfvel().mag(),
            'velocity:surface': lambda: self.srfvel(), 'velocity:orbit': lambda: Vec(self.vel.x, self.vel.y),
            'mass': lambda: self.mass(), 'wetmass': lambda: self.mass(),
            'drymass': lambda: sum(s['dry'] for s in self.stages[self.attached:]),
            'maxthrust': lambda: self.maxthrust(), 'availablethrust': lambda: self.maxthrust(),
            'maxthrustat': lambda: self.maxthrust(),
            'latitude': lambda: 0.0, 'longitude': lambda: self.longitude(),
            'geoposition': lambda: LatLng(0, self.longitude()),
            'stage:liquidfuel': lambda: (self.cur_stage() or {'fuel': 0})['fuel'] * 90.0,
            'stage:oxidizer': lambda: (self.cur_stage() or {'fuel': 0})['fuel'] * 110.0,
            'stage:solidfuel': lambda: 0.0, 'stage:number': lambda: self.stagenum(),
            'stagenum': lambda: self.stagenum(), 'stage:ready': lambda: True,
            'liquidfuel': lambda: sum(s['fuel'] for s in self.stages[self.attached:]) * 90.0,
            'time:seconds': lambda: self.t, 'time': lambda: self.t, 'missiontime': lambda: self.t,
            'throttle': lambda: self.throttle, 'control:pilotmainthrottle': lambda: self.pilot_throttle,
            'body:mu': lambda: MU, 'body:radius': lambda: R_KERBIN, 'body:name': lambda: 'Kerbin',
            'body:atm:height': lambda: ATM_H, 'body:rotationperiod': lambda: (2 * math.pi / self.omega) if self.omega else 0.0,
            'constant:g0': lambda: G0, 'constant:pi': lambda: math.pi, 'constant:e': lambda: math.e,
            'constant:g': lambda: 6.67430e-11, 'constant:degtorad': lambda: math.pi / 180, 'constant:radtodeg': lambda: 180 / math.pi,
            'status': lambda: self.status(), 'name': lambda: self.cfg.get('name', 'Vessel'), 'shipname': lambda: self.cfg.get('name', 'Vessel'),
            'up': lambda: self.up(), 'facing': lambda: self.facing,
            'prograde': lambda: self.vel.norm(), 'retrograde': lambda: -self.vel.norm(),
            'srfprograde': lambda: self.srfvel().norm() if self.srfvel().mag() > 0.5 else self.up(),
            'srfretrograde': lambda: -self.srfvel().norm() if self.srfvel().mag() > 0.5 else self.up(),
            'north': lambda: (self.warn('NORTH is out of the 2D plane – treated as current facing') or self.facing),
            'body': lambda: 'Kerbin', 'ship': lambda: self.cfg.get('name', 'Vessel'),
            'yellow': lambda: 'YELLOW', 'red': lambda: 'RED', 'green': lambda: 'GREEN', 'blue': lambda: 'BLUE',
            'white': lambda: 'WHITE', 'black': lambda: 'BLACK', 'cyan': lambda: 'CYAN', 'magenta': lambda: 'MAGENTA',
            'terminal:width': lambda: 50.0, 'terminal:height': lambda: 36.0,
        }
        if p in self.flags: return self.flags[p]
        f = T.get(p)
        return None if f is None else f()

    # ---- expression evaluation
    def lookup(self, name, scopes):
        for sc in reversed(scopes):
            if name in sc: return True, sc[name]
        return False, None
    def val(self, v, scopes):
        if isinstance(v, LockVal): return self.ev(v.ast, scopes)
        return v
    def ev(self, n, scopes):
        k = n[0]
        if k == 'num': return n[1]
        if k == 'str': return n[1]
        if k == 'neg':
            a = self.ev(n[1], scopes); return -a
        if k == 'not': return not self.truthy(self.ev(n[1], scopes))
        if k == 'and': return self.truthy(self.ev(n[1], scopes)) and self.truthy(self.ev(n[2], scopes))
        if k == 'or': return self.truthy(self.ev(n[1], scopes)) or self.truthy(self.ev(n[2], scopes))
        if k == 'bin': return self.binop(n[1], self.ev(n[2], scopes), self.ev(n[3], scopes))
        if k == 'chain': return self.chain(n[1], scopes, n[2])
        if k == 'suffix':
            v = self.ev(n[1], scopes)
            for nm, args in n[2]: v = self.apply_suffix(v, nm, args, scopes)
            return v
        raise KosError(f"cannot evaluate {k}")
    def truthy(self, v):
        if isinstance(v, str): return v.lower() == 'true' or v != ''
        return bool(v)
    def binop(self, op, a, b):
        if op == '+':
            if isinstance(a, str) or isinstance(b, str): return kstr(a) + kstr(b)
            return a + b
        if op == '-': return a - b
        if op == '*':
            if isinstance(a, Vec) and isinstance(b, Vec): return a.dot(b)
            return (b * a) if isinstance(b, Vec) else a * b
        if op == '/':
            if isinstance(a, Vec): return a * (1.0 / b)
            if b == 0: raise KosError("division by zero")
            return a / b
        if op == '^':
            try: return float(a) ** float(b)
            except (OverflowError, ValueError, ZeroDivisionError): raise KosError(f"invalid power {a}^{b}")
        if op in ('=', '<>'):
            if isinstance(a, str) and isinstance(b, str): r = a.lower() == b.lower()
            else: r = a == b
            return r if op == '=' else not r
        if isinstance(a, bool) or isinstance(b, bool): a, b = float(a), float(b)
        if op == '<': return a < b
        if op == '>': return a > b
        if op == '<=': return a <= b
        if op == '>=': return a >= b
        raise KosError(f"unknown operator {op}")
    def apply_suffix(self, v, nm, args, scopes):
        if hasattr(v, 'suffix'): return v.suffix(nm, args, self)
        if isinstance(v, str):
            if nm == 'length': return float(len(v))
            if nm == 'toupper': return v.upper()
            if nm == 'tolower': return v.lower()
            if nm == 'tonumber': return float(v)
        if isinstance(v, (int, float)) and nm == 'tostring': return kstr(v)
        raise KosError(f"{type(v).__name__} has no suffix :{nm.upper()}")
    def chain(self, parts, scopes, line):
        n0, a0 = parts[0]
        if a0 is not None:
            v = self.call(n0, [self.ev(a, scopes) for a in a0], line); rest = parts[1:]
        else:
            found, v = self.lookup(n0, scopes)
            if found:
                v = self.val(v, scopes); rest = parts[1:]
            else:
                v = None; rest = None
                for k in range(len(parts), 0, -1):
                    if any(a is not None for _, a in parts[1:k]): continue
                    path = ':'.join(p for p, _ in parts[:k])
                    r = self.tele(path)
                    if r is not None:
                        v = r; rest = parts[k:]; break
                if rest is None:
                    raise KosError(f"line {line}: undefined variable or unsupported value '{':'.join(p for p, _ in parts).upper()}'")
        for nm, args in rest: v = self.apply_suffix(v, nm, args, scopes)
        return v
    def call(self, name, args, line):
        if name in self.funcs:
            return self.call_user(name, args)
        d = math.degrees; r = math.radians
        B = {
            'sqrt': lambda x: math.sqrt(x) if x >= 0 else (_ for _ in ()).throw(KosError(f"line {line}: SQRT of negative number {x:.4g}")),
            'abs': abs, 'floor': lambda x: float(math.floor(x)), 'ceiling': lambda x: float(math.ceil(x)),
            'round': lambda x, n=0: float(round(x, int(n))), 'sin': lambda x: math.sin(r(x)), 'cos': lambda x: math.cos(r(x)),
            'tan': lambda x: math.tan(r(x)), 'arcsin': lambda x: d(math.asin(max(-1, min(1, x)))),
            'arccos': lambda x: d(math.acos(max(-1, min(1, x)))), 'arctan': lambda x: d(math.atan(x)),
            'arctan2': lambda y, x: d(math.atan2(y, x)), 'ln': math.log, 'log10': math.log10, 'mod': lambda a, b: math.fmod(a, b),
            'min': min, 'max': max, 'heading': lambda h, p, *rest: self.heading_vec(h, p),
            'latlng': lambda la, lo: LatLng(la, lo), 'random': lambda *a: 0.5,
            'hudtext': lambda txt, *a: self.out(f"[HUD] {kstr(txt)}", hud=True),
            'v': lambda x, y, z=0: Vec(x, y), 'vang': lambda a, b: d(math.acos(max(-1, min(1, a.norm().dot(b.norm()))))),
            'char': lambda c: chr(int(c)), 'unchar': lambda s: float(ord(s[0])),
            'clearscreen': lambda: self.clear(),
        }
        f = B.get(name)
        if f is None:
            self.warn(f"line {line}: function {name.upper()}() is not supported by the simulator – returns 0")
            return 0.0
        try:
            res = f(*args)
        except TypeError as e:
            raise KosError(f"line {line}: bad arguments for {name.upper()}(): {e}")
        except ValueError as e:
            raise KosError(f"line {line}: math error in {name.upper()}(): {e}")
        return 0.0 if res is None else res
    def call_user(self, name, args):
        body = self.funcs[name]
        scopes = [self.globals, {'__args__': list(args)}]
        try:
            for _ in self.exec_block(body[1], scopes, newscope=False):
                self.warn(f"WAIT inside function {name.upper()} called from an expression is ignored in the simulator")
        except _Return as r:
            return 0.0 if r.v is None else r.v
        return 0.0

    # ---- statements (generators: yield = wait one physics tick)
    def exec_block(self, stmts, scopes, newscope=True):
        if newscope: scopes = scopes + [{}]
        for s in stmts:
            yield from self.exec_stmt(s, scopes)
    def set_var(self, name, value, scopes):
        for sc in reversed(scopes):
            if name in sc: sc[name] = value; return
        self.globals[name] = value
    def exec_stmt(self, s, scopes):
        self.ops += 1
        if self.ops > 250:
            yield; self.ops = 0
        k = s[0]
        if k == 'set':
            name, e = s[1], s[2]
            v = self.ev(e, scopes)
            if name in ('ship:control:pilotmainthrottle', 'control:pilotmainthrottle'): self.pilot_throttle = float(v); return
            if name in ('throttle', 'steering'): self.locks[name] = ('const', v); return
            if ':' in name:
                self.warn(f"line {s[3]}: SET {name.upper()} is ignored by the simulator"); return
            self.set_var(name, v, scopes)
        elif k == 'local':
            scopes[-1][s[1]] = self.ev(s[2], scopes)
        elif k == 'lock':
            if s[1] in ('throttle', 'steering'): self.locks[s[1]] = ('lock', s[2], scopes)
            else: self.globals[s[1]] = LockVal(s[2])
        elif k == 'unlock':
            if s[1] == 'all': self.locks.clear()
            else:
                self.locks.pop(s[1], None)
                if isinstance(self.globals.get(s[1]), LockVal): del self.globals[s[1]]
        elif k == 'param':
            args = scopes[-1].get('__args__', [])
            for i, (n, d) in enumerate(s[1]):
                if i < len(args): scopes[-1][n] = args[i]
                elif d is not None: scopes[-1][n] = self.ev(d, scopes)
                else: raise KosError(f"line {s[2]}: missing argument for parameter {n.upper()}")
        elif k == 'func':
            self.funcs[s[1]] = s[2]
        elif k == 'return':
            raise _Return(None if s[1] is None else self.ev(s[1], scopes))
        elif k == 'block':
            yield from self.exec_block(s[1], scopes)
        elif k == 'if':
            if self.truthy(self.ev(s[1], scopes)): yield from self.exec_block(s[2][1], scopes)
            elif s[3]: yield from self.exec_block(s[3][1], scopes)
        elif k == 'until':
            try:
                while not self.truthy(self.ev(s[1], scopes)):
                    yield from self.exec_block(s[2][1], scopes)
            except _Break: pass
        elif k == 'from':
            sc = scopes + [{}]
            yield from self.exec_block(s[1][1], sc, newscope=False)
            try:
                while not self.truthy(self.ev(s[2], sc)):
                    yield from self.exec_block(s[4][1], sc)
                    yield from self.exec_block(s[3][1], sc, newscope=False)
            except _Break: pass
        elif k == 'when':
            self.triggers.append([s[1], s[2], s[3], scopes])
        elif k == 'preserve':
            self._preserve = True
        elif k == 'break':
            raise _Break()
        elif k == 'wait':
            dur = float(self.ev(s[1], scopes)); until = self.t + dur - 1e-9
            yield
            while self.t < until: yield
        elif k == 'waituntil':
            while not self.truthy(self.ev(s[1], scopes)): yield
        elif k == 'print':
            v = kstr(self.ev(s[1], scopes))
            if s[2]:
                c, r = int(self.ev(s[2][0], scopes)), int(self.ev(s[2][1], scopes))
                if 0 <= r < len(self.screen):
                    line = self.screen[r].ljust(c)
                    self.screen[r] = line[:c] + v + line[c + len(v):]
            else:
                self.out(v)
        elif k == 'clearscreen':
            self.clear()
        elif k == 'stage':
            self.do_stage()
        elif k == 'toggle':
            if s[1] == '?': self.warn(f"line {s[3]}: unknown ON/OFF target – ignored"); return
            self.flags[s[1]] = s[2]
            self.events.append((self.t, f"{s[1].upper()} {'ON' if s[2] else 'OFF'}"))
        elif k == 'expr':
            e = s[1]
            if e[0] == 'chain' and len(e[1]) == 1 and e[1][0][1] is not None and e[1][0][0] in self.funcs:
                name = e[1][0][0]; args = [self.ev(a, scopes) for a in e[1][0][1]]
                sc = [self.globals, {'__args__': args}]
                try: yield from self.exec_block(self.funcs[name][1], sc, newscope=False)
                except _Return: pass
            else:
                self.ev(e, scopes)
        elif k == 'unsupported':
            self.warn(f"line {s[2]}: statement '{s[1][:40].upper()}' is not supported by the simulator – skipped")
    def clear(self):
        self.screen = [''] * 36; self.cursor = 0
    def out(self, text, hud=False):
        self.log.append((round(self.t, 2), text))
        if hud: return
        for ln in text.split('\n'):
            if self.cursor >= len(self.screen):
                self.screen.pop(0); self.screen.append(''); self.cursor = len(self.screen) - 1
            self.screen[self.cursor] = ln; self.cursor += 1

    # ---- physics
    def step(self, dt):
        self._orb = None
        # throttle
        lk = self.locks.get('throttle')
        if lk:
            v = lk[1] if lk[0] == 'const' else self.ev(lk[1], lk[2])
            try: self.throttle = max(0.0, min(1.0, float(v)))
            except (TypeError, ValueError): self.warn("THROTTLE must be a number")
        elif self.program_done or not lk:
            self.throttle = max(0.0, min(1.0, self.pilot_throttle)) if 'throttle' not in self.locks else self.throttle
        # steering
        ls = self.locks.get('steering')
        if ls:
            tv = ls[1] if ls[0] == 'const' else self.ev(ls[1], ls[2])
            if isinstance(tv, Vec) and tv.mag() > 1e-9:
                tgt = math.atan2(tv.y, tv.x); cur = math.atan2(self.facing.y, self.facing.x)
                d = (tgt - cur + math.pi) % (2 * math.pi) - math.pi
                mx = self.turn_rate * dt
                cur += max(-mx, min(mx, d))
                self.facing = Vec(math.cos(cur), math.sin(cur))
            elif not isinstance(tv, Vec):
                self.warn("STEERING must be a direction (HEADING(), PROGRADE, UP, …) – ignored")
        self._orb = None
        r = self.pos.mag(); m = self.mass()
        thrust = self.throttle * self.maxthrust()
        acc = self.facing * (thrust / m)
        vs = self.srfvel(); vsm = vs.mag()
        rho = RHO0 * self.pressure()
        cda = sum(s['cda'] for s in self.stages[self.attached:])
        q = 0.5 * rho * vsm * vsm
        self.max_q = max(self.max_q, q)
        if vsm > 1e-6: acc = acc - vs * (q * cda / 1000.0 / m / vsm)
        g = self.pos * (-MU / r ** 3)
        acc = acc + g
        if self.landed:
            # sitting on the ground: only lift off if net radial accel is positive
            if acc.dot(self.up()) <= 0:
                self.vel = self.rotv(self.pos); acc = Vec(0, 0)
            else:
                self.landed = False
        self.vel = self.vel + acc * dt
        self.pos = self.pos + self.vel * dt
        if thrust > 0:
            s = self.cur_stage()
            s['fuel'] = max(0.0, s['fuel'] - thrust / (self.isp() * G0) * dt)
            self.dv_used += thrust / m * dt
        self.t += dt
        self._orb = None
        h = self.altitude()
        if h > 20: self.flown = True
        self.max_alt = max(self.max_alt, h)
        if h < 0:
            impact = self.srfvel().mag()
            if impact > 10:
                self.outcome = 'CRASHED'; self.done_reason = f"Impact at {impact:.1f} m/s"
                self.pos = self.up() * R_KERBIN
                return
            self.pos = self.up() * R_KERBIN; self.vel = self.rotv(self.pos)
            if not self.landed and self.flown:
                self.events.append((self.t, f"Touchdown at {impact:.1f} m/s"))
            self.landed = True
        self.max_speed = max(self.max_speed, self.srfvel().mag())
        if self.pos.mag() > SOI: self.outcome = 'ESCAPED'

    def record(self):
        o = self.orbit(); S = self.series
        S['t'].append(round(self.t, 2)); S['alt'].append(round(self.altitude(), 1))
        S['speed'].append(round(self.srfvel().mag(), 2)); S['orbit_speed'].append(round(self.vel.mag(), 2))
        S['throttle'].append(round(self.throttle, 3)); S['mass'].append(round(self.mass(), 3))
        S['x'].append(round(self.pos.x)); S['y'].append(round(self.pos.y))
        S['ap'].append(round(o['ap'])); S['pe'].append(round(o['pe']))

    def run(self):
        try:
            prog = Parser(self.code, self.warn).program()
        except Exception as e:
            self.error = f"Parse failure: {e}"; prog = []
        for s in prog:
            if s[0] == 'func': self.funcs[s[1]] = s[2]
        main = self.exec_block([s for s in prog if s[0] != 'func'], [self.globals], newscope=False)
        trig_gen = None; trig = None
        next_rec = 0.0
        coast_until = None
        while True:
            if self.t >= self.tmax: self.outcome = self.outcome or 'TIMEOUT'; break
            if self.outcome: break
            self._orb = None; self.ops = 0
            if not self.program_done:
                try:
                    if trig_gen is None:
                        for tr in list(self.triggers):
                            if tr not in self.triggers: continue
                            if self.truthy(self.ev(tr[0], tr[3])):
                                self.triggers.remove(tr); self._preserve = False
                                g = self.exec_block(tr[1][1], tr[3])
                                if self._run_trigger(g):
                                    trig_gen, trig = g, tr; break
                                if self._preserve: self.triggers.append(tr)
                    else:
                        if not self._run_trigger(trig_gen):
                            if self._preserve: self.triggers.append(trig)
                            trig_gen = None
                    if trig_gen is None:
                        next(main)
                except StopIteration:
                    self.program_done = True; self.done_reason = 'Program finished'
                    self.events.append((self.t, 'Program ended'))
                    self.locks.clear(); self.throttle = self.pilot_throttle
                except (_Return, _Break):
                    self.program_done = True; self.done_reason = 'Program finished (RETURN/BREAK at top level)'; self.locks.clear()
                except KosError as e:
                    self.error = str(e); self.program_done = True; self.done_reason = 'Program error'; self.locks.clear()
                    self.out(f"ERROR: {e}")
                except RecursionError:
                    self.error = "recursion too deep"; self.program_done = True; self.locks.clear()
            if self.program_done:
                st = self.status()
                if st == 'ORBITING' or not self.cfg.get('coast_after_end', True) or (self.landed and not self.flown) or st == 'PRELAUNCH':
                    break
                if self.landed and self.flown: self.outcome = 'LANDED'; break
            dt = self.dt if not self.program_done else self.dt * 4
            try:
                self.step(dt)
            except KosError as e:
                self.error = str(e); self.program_done = True; self.locks.clear()
            if self.landed and self.flown:
                if self.landed_since is None: self.landed_since = self.t
                if self.t - self.landed_since > 15: self.outcome = 'LANDED'; break
            else:
                self.landed_since = None
            if self.t >= next_rec:
                self.record(); next_rec = self.t + 0.5
        self.record()
        if not self.outcome:
            st = self.status()
            self.outcome = {'ORBITING': 'ORBIT', 'LANDED': 'LANDED', 'PRELAUNCH': 'ON PAD'}.get(st, 'SUBORBITAL' if st != 'ESCAPING' else 'ESCAPED')
        if self.error: self.done_reason = (self.done_reason + ': ' if self.done_reason else '') + self.error
        return SimResult(self)

    def _run_trigger(self, g):
        """advance trigger generator; True if it is still waiting"""
        sc_preserve = getattr(self, '_preserve', False)
        try:
            next(g); return True
        except StopIteration:
            return False

class SimResult:
    def __init__(self, s):
        o = s.orbit()
        fuel_left = sum(st['fuel'] for st in s.stages[s.attached:])
        self.summary = {
            'outcome': s.outcome, 'reason': s.done_reason, 'time': round(s.t, 1),
            'max_alt': round(s.max_alt), 'final_alt': round(s.altitude()),
            'apoapsis': round(o['ap']), 'periapsis': round(o['pe']), 'eccentricity': round(o['e'], 4),
            'dv_used': round(s.dv_used, 1), 'max_speed': round(s.max_speed, 1), 'final_speed': round(s.srfvel().mag(), 1),
            'max_q_kpa': round(s.max_q / 1000, 2), 'fuel_left_t': round(fuel_left, 3), 'mass_t': round(s.mass(), 3),
            'stages_left': s.stagenum(), 'error': s.error,
        }
        self.log = s.log; self.screen = s.screen; self.series = s.series
        self.events = s.events; self.warnings = s.warnings
    def __getitem__(self, k): return self.summary[k]
    def __repr__(self):
        x = self.summary
        return (f"<SimResult {x['outcome']}: t={x['time']}s maxAlt={x['max_alt']} Ap={x['apoapsis']} Pe={x['periapsis']} "
                f"dv={x['dv_used']}>")
    def to_json(self):
        return json.dumps({'summary': self.summary, 'log': self.log, 'screen': self.screen, 'series': self.series,
                           'events': self.events, 'warnings': self.warnings})

def run(code, vessel=None, **opts):
    return Sim(code, vessel, **opts).run()

def set_var_in_code(code, name, value):
    pat = re.compile(r'^(\s*SET\s+' + re.escape(name) + r'\s+TO\s+)(-?[\d.]+(?:e[+-]?\d+)?)(\s*\.\s*)$', re.I | re.M)
    new, n = pat.subn(lambda m: m.group(1) + kstr(float(value)) + m.group(3), code, count=1)
    if not n: raise ValueError(f"no 'SET {name} TO <number>.' line found")
    return new

def sweep(code, name, values, vessel=None, **opts):
    out = []
    for v in values:
        out.append((v, run(set_var_in_code(code, name, v), vessel, **opts)))
    return out
