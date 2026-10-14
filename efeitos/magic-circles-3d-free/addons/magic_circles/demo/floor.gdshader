shader_type spatial;
// The demo's flagstones, laid by world position: offset rows of worn stone, dark joints between.

uniform vec3 stone : source_color = vec3(0.2, 0.19, 0.23);
uniform float size = 1.1;

varying vec3 world;
varying vec3 world_normal;

float hash(vec2 p) {
	uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
	return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
}

void fragment() {
	vec2 p = (abs(normalize(world_normal).y) > 0.5 ? world.xz : world.xy + world.zz) / size;
	float row = floor(p.y);
	p.x += hash(vec2(row, 7.0)) * 0.8;
	vec2 cell = floor(p);
	vec2 f = fract(p);
	float joint = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
	float tone = 0.75 + 0.5 * hash(cell + 3.0);
	float grain = 0.8 + 0.4 * noise(world.xz * 9.0) * noise(world.xz * 2.3 + 5.0);
	ALBEDO = stone * tone * grain * mix(0.25, 1.0, joint);
	ROUGHNESS = 0.85;
	SPECULAR = 0.3;
}
