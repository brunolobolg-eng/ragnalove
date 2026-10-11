extends Node3D
## Pick a kind and an element for the area in the middle of the ring; click the ground to cast it
## there as a one-shot. Drag to turn the camera, scroll to zoom.

const STAGE := preload("res://addons/magic_circles/demo/stage.gd")
const START := ["frost_vortex", "arcane_circle"]   # the first installed is on

var kind := ""
var element := ""
var area: MagicArea
var cam := Camera3D.new()
var turn := 0.7
var distance := 10.0
var dragging := false
var dragged := 0.0
var ui := CanvasLayer.new()


func _ready() -> void:
	add_child(STAGE.new())
	cam.fov = 55
	add_child(cam)
	var first: String = START.filter(func(p: String) -> bool: return p in MagicArea.presets())[0]
	element = first.get_slice("_", 0)
	kind = first.get_slice("_", 1)
	add_child(ui)
	var panel := PanelContainer.new()
	panel.position = Vector2(16, 16)
	ui.add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	box.add_child(_row("Kind", MagicArea.kinds(), func(k: String) -> void:
		kind = k
		_place()))
	box.add_child(_row("Element", PackedStringArray(MagicArea.ELEMENTS.keys()), func(e: String) -> void:
		element = e
		_place()))
	var look := OptionButton.new()
	for t in ["smooth", "dither (PS1)", "cutout"]:
		look.add_item(t)
	look.item_selected.connect(func(i: int) -> void:
		MagicArea.default_transparency = i
		_place())
	var line := HBoxContainer.new()
	line.add_child(_caption("Transparency"))
	line.add_child(look)
	box.add_child(line)
	var hint := _caption("Click the ground to cast it. Drag to turn, scroll to zoom.")
	box.add_child(hint)
	_place()


func _row(title: String, names: PackedStringArray, pick: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_child(_caption(title))
	var group := ButtonGroup.new()
	for n in names:
		var b := Button.new()
		b.text = n
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = n == kind or n == element
		if n in MagicArea.ELEMENTS:
			b.add_theme_color_override("font_color", MagicArea.ELEMENTS[n].edge_color.lerp(Color.WHITE, 0.35))
		b.pressed.connect(pick.bind(n))
		row.add_child(b)
	return row


func _caption(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.custom_minimum_size.x = 104
	return l


## The area in the middle, again with the picked kind, element and transparency.
func _place() -> void:
	if area:
		area.free()
	area = MagicArea.add(self, "%s_%s" % [element, kind], {radius = 2.2, height = 4.5})


func _process(delta: float) -> void:
	if not dragging:
		turn += delta * 0.08
	cam.position = Vector3(sin(turn), 0.5, cos(turn)) * distance
	cam.look_at(Vector3(0, 1.2, 0))


func _unhandled_input(event: InputEvent) -> void:
	var button := event as InputEventMouseButton
	if button and button.pressed:
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				distance = maxf(distance * 0.9, 4.0)
			MOUSE_BUTTON_WHEEL_DOWN:
				distance = minf(distance * 1.1, 18.0)
			MOUSE_BUTTON_LEFT:
				dragged = 0.0
	elif button and button.button_index == MOUSE_BUTTON_LEFT and dragged < 6.0:
		_cast(button.position)
	var motion := event as InputEventMouseMotion
	dragging = motion != null and motion.button_mask != 0
	if dragging:
		dragged += motion.relative.length()
		turn -= motion.relative.x * 0.006


## The picked area as a one-shot where the click meets the ground.
func _cast(at: Vector2) -> void:
	var from := cam.project_ray_origin(at)
	var dir := cam.project_ray_normal(at)
	if dir.y < -0.01:
		MagicArea.add(self, "%s_%s" % [element, kind], {position = from + dir * (-from.y / dir.y),
			radius = 1.3, height = 3.0, one_shot = true, light = false})
