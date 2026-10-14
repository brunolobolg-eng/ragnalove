extends Node3D
## The ground the demo and the store scenes cast on: a flagstone floor, standing stones round its
## edge, moonlight, and a night Environment whose glow makes the effects bloom.

const FLOOR := preload("res://addons/magic_circles/demo/floor.gdshader")

@export var size := 30.0
## Standing stones in a ring this far out; 0 for none.
@export var ring := 7.5
@export var night := Color(0.035, 0.03, 0.06)


func _ready() -> void:
	var floor_mat := ShaderMaterial.new()
	floor_mat.shader = FLOOR
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE * size
	plane.subdivide_width = 8
	plane.subdivide_depth = 8
	ground.mesh = plane
	ground.material_override = floor_mat
	add_child(ground)
	if ring > 0.0:
		for i in 9:
			var a := TAU * (i + 0.3) / 9.0
			var tall := 1.6 + fmod(i * 1.7, 1.4)
			var stone := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(0.9, tall, 0.6)
			stone.mesh = box
			stone.material_override = floor_mat
			stone.position = Vector3(cos(a) * ring, tall * 0.5 - 0.05, sin(a) * ring)
			stone.rotation = Vector3(0.06 * sin(i * 2.1), -a + 0.3 * cos(i * 1.3), 0.05 * cos(i * 3.7))
			add_child(stone)
	var moon := DirectionalLight3D.new()
	moon.rotation_degrees = Vector3(-50, 30, 0)
	moon.light_color = Color(0.55, 0.6, 1.0)
	moon.light_energy = 0.25
	add_child(moon)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = night
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.3, 0.28, 0.42)
	env.ambient_light_energy = 0.5
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 0.9
	env.fog_enabled = true
	env.fog_light_color = night
	env.fog_density = 0.03
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
