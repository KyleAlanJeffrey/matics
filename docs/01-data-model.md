# Data model

One normalized project document. Views never own data; they project from it.

```
Project
  presets:      Record<id, DevicePreset>    library entries (Motor driver MD-200, ...)
  devices:      Record<id, DeviceInstance>  placed instances (Front motor driver, qty 1)
  buses:        Record<id, Bus>             shared networks with their own tag and color
  zones:        Record<id, Zone>            Core, Front module, Rear module
  connections:  Record<id, Connection>      port -> port, or port -> bus; route corners
  freeWires:    Record<id, FreeWire>        unattached orthogonal polylines
  bundles:      Record<id, WireBundle>      shared trunks that several connections run along
  images:       Record<id, DiagramImage>    pictures placed on the schematic
  documents:    Record<id, Document>        pdf / note / guide, with scope
  docLinks:     DocLink[]                   document <-> entity association
  notes:        Record<entityId, Note>      Markdown per product, bus or document
  frames:       Record<id, CanFrame>        CAN identifier ranges with sender and receivers
  messages:     Record<id, ProtoMessage>    Protobuf message types with their routing
  sketches:     Record<id, Sketch>          Excalidraw scenes
  ioModules:    Record<id, IoModule>        I/O modules on a controller
  ioSignals:    Record<id, IoSignal>        channel bindings on a module
  netInterfaces: Record<id, NetInterface>   fieldbus interfaces such as Modbus
  netMappings:  Record<id, NetMapping>      PLC variables mapped on an interface
  routes:       Record<id, Route>           end-to-end connections (no UI yet)
```

## Ports

Ports are logical (`CAN 1`, `DI 1-6`, `GMSL 1-6`), never physical pin numbers.
A port is declared on the preset as a template and instantiated per device. A port has a
`kind` (ethernet, can, gmsl, pulse, digital-in, digital-out, valve) which drives its color
and which connections it accepts. A port has a `count` so `DI 1-6` can carry 6 lines.
An optional `variant` ("Classic", "100BASE-TX", "GMSL 2") is a text badge on the card; it
never changes the color. Family, variant and network identity are three separate things.

## Buses

A `Bus` is a network several ports share. Its `kind` is the family (CAN, Ethernet), its
`variant` the protocol flavour ("Classical CAN", "CAN FD"; empty means not confirmed),
its `rate` the bitrate text. `tag` ("B1") and `color` are the bus's identity: wires into
the bus take the bus color instead of the family color, ports wired to it show the tag,
and the legend lists each bus separately. Two CAN networks therefore read apart by both
color and label. `repeatLabels` draws the tag beside every tap on the bar. `position` is the top of the
bar and `length` its minimum extent; taps below that end stretch it further.

## CAN frames

A `CanFrame` is an expected allocation of CAN identifiers: an inclusive `startId..endId`
range (a single frame has both equal), the `senderId`, the `receiverIds`, and optionally
the `busIds` it travels on (several when a gateway forwards it), a `group` for the frames table and free-text `notes`. Parties
are device ids, or a preset id when every placed copy of a product takes part ("Motor driver
(all 3)"). Counts derived from frames are distinct identifiers, never message rates. The
sample's frames leave their buses unset. Frames can also be read from a Vector DBC file
(`src/model/dbc.ts`): each `BO_` message becomes a single-id frame whose sender is the
message transmitter and whose receivers are the union of its signals' receivers, with
`CM_ BO_` comments as notes. DBC nodes are matched to devices by name in an import dialog.

## Connections

`from` and `to` are `PortRef { deviceId, portId }` or `BusRef { busId }`. `lineCount`
renders the slash-count bundle mark. The wire color comes from the bus when `to` is a bus,
otherwise from the source port's kind. A wire into a bus taps the bar level with the middle
of its source card unless `route.tapY` (an absolute flow y) says otherwise; the bar grows to
cover every tap. When a bus loses its last wire it keeps the bar it was drawing (position
and `length` are rewritten) rather than snapping back to a stub.

## Bundles

A `WireBundle` is an orthogonal trunk polyline plus the ids of the connections that run
along it. The trunk's exit end is the end nearer the members' shared target (or nearer the
parent trunk). A bundled connection (`bundleId` set) is drawn as two tails: source port to
where it joins the trunk (`joins[connectionId]`, a point on the trunk, else the start end;
`route.points` are that tail's corners) and the exit end to the target (`route.exitPoints`).
The trunk is drawn in runs split at every join, each run carrying the lines that have
arrived so far, with the label on the longest run. A bundle may run into another trunk
(`parent: { bundleId, point }`): its members' exit tails then leave from the root trunk's
exit, and the parent counts the child's lines from that point on. Removing a connection
removes it from its bundle; an emptied bundle disappears and its children become roots.

## Pictures

A `DiagramImage` is a picture dropped on the schematic (a machine photo, a mounting
sketch). `src` takes the same forms as a preset's `imageUrl`: in the desktop app the file is
copied into `assets/`, the browser dev build keeps a data URL (large photos are scaled to
1600px). `position` and `size` are in flow pixels.
Pictures draw above zones and below wires and devices; they are not part of the connection
report tables. Projects saved before pictures existed load with `images: {}`.

## Quantities

A `DeviceInstance` has `qty`. The schematic card shows one picture per unit (up to six,
then "+N more") and a QTY chip. Connections from a stacked device carry
`lineCount = qty` by default.

## Card display

The schematic is a device and architecture overview first, not a pin-level wiring
diagram. `DeviceInstance.card` holds how that copy draws:

- `layout`: `overview` (default) shows identity (thumbnail, name, quantity, the product's
  `role` and IP address), services and a docs count. `detailed` adds the larger picture,
  the product summary and a property table. In both, ports are small tabs on the card
  edges: only connected ports show a tab until the card is hovered or selected, or a
  wire is being drawn, when the free ports appear below them.
- `picture`: large, small or none, for the detailed layout.
- `props`: the property keys drawn on the card. When absent, only `ip` is drawn.
  Link-valued properties are never drawn.

- `services`: `first` (default) shows two service rows plus a count of the rest; `all`
  lists every service on the card.

`setCardDisplay` removes a setting that returns to its default. Both layouts keep one
width. `DevicePreset.role` is a short role
("Gateway", "Compute"); without one the card falls back to the category.

## Protobuf messages

A `ProtoMessage` (in `Project.messages`) is a message type read from a `.proto` file or
typed in: `name` (nested messages as `Outer.Inner`), the `schemaFile` it came from, its
`package`, a `version` (the last package segment when it looks like `v1`), and `fields` (`name`,
`type`, `tag`, `repeated`). Routing is a `sender` and any number of `receivers`, each a
`MessageEndpoint` of `deviceId` plus an optional `serviceId`, and a free-text `transport`.
`src/model/proto.ts` parses proto2/proto3 message blocks, including oneof and map fields,
and skips enums, services and options. Re-importing a file updates messages matched by
name, schema file and package and keeps their routing. Removing a device or service clears it from
message endpoints. A message's documents and note are keyed by its id.

## I/O

An `IoModule` (in `Project.ioModules`) is a module on a controller device: `deviceId`,
`name` (the module name in the controller's I/O mapping, such as `IO-1`) and an optional
`description`. An `IoSignal` (in `Project.ioSignals`) binds one channel of a module:
`moduleId`, `name`, `channel` (`AnalogInput01`), `kind` (`ai`, `ao`, `di`, `do`, `pwm`,
`encoder`, `other`), `direction`, and the optional PLC `variable` and `task` class
(`Cyclic#5`, a class, not a duration). `settings` are other bindings that configure the
same channel (a PWM period, current feedback), each with a `role`, `channel`, `direction`
and optional `variable` and `task`; they are not separate wires. The field side is
optional: `fieldDeviceId`, `pin` (a connector pin, never inferred from the channel name)
and `range`. Kind `other` marks module-level bindings (module status, serial numbers),
which have no field side.

`src/model/io.ts` reads B&R `IoMap.iom` files (`parseIoMap`, `ioMapModules`). Lines whose
channel has a dot (`"CPU".IF2.symbol`) are fieldbus interface mappings (see Network
interfaces below); `ioMapInterfaces` groups them. Re-importing matches modules by device
and name and signals by channel, updates the binding and keeps the field side, notes and
documents. A channel bound to several variables (an input read into two) is one signal per
variable; on re-import a signal pairs with its own variable first, so a renamed variable
still updates the signal it belonged to. A signal's note and documents are keyed by its id. Removing a module removes
its signals; removing a device removes its modules and interfaces and clears it as a
field device or peer.

## Network interfaces

A `NetInterface` (in `Project.netInterfaces`) is a controller's fieldbus interface:
`deviceId`, the hardware `module` it is on (as the controller names it), `name` (`IF2`), a
free-text `protocol` (imports set `Modbus`), and the optional `peerDeviceId`, `transport`
and `unitId`. A `NetMapping` (in `Project.netMappings`) is one PLC variable exchanged over
it under a symbolic name: `interfaceId`, `name`, `symbol`, `direction` (from the
controller's side), and the optional `variable`, `task` and `register`. A symbolic mapping
does not imply a register address; `register` stays empty until someone records it.
Mappings keep the order they were added in, which for an import is the file's order.

Importing an `IoMap.iom` matches interfaces by device, module and name and mappings by
symbol; a match gets the new variable, direction and task and keeps its name, register,
notes and documents. An interface added by hand has no module, so the import takes it over
when it is the only interface on the device with that name. A symbol bound to several
variables pairs the same way as a channel. New mappings are named after their symbol (`pump_speed`
reads "Pump speed"). Removing an interface removes its mappings and their notes
and document links.

`Route` is stored but not edited yet; the Communications page will use it for end-to-end
connections. Removing a device or service clears it from route ends.

## Sketches

A `Sketch` (in `Project.sketches`) stores an Excalidraw scene: `elements` and `files`
(pasted images as data URLs) exactly as Excalidraw produces them, minus deleted elements
and unused files, plus a `name`, `deviceIds` it is linked to and `updatedAt`. Removing a device leaves its id
in `deviceIds` (hidden while the device is gone) so undoing the removal brings the link back. Shapes can
link to a device's documentation page. Sketch edits are not part of project undo: the
canvas has its own history, and stepping project history keeps the current sketches.

## Services

A `DeviceInstance` may carry `services`: the software declared on that placed copy, not
on the product, because two copies of one controller can run different things. Each
`DeviceService` has an `id` (`svc-...`), a required `name`, an optional `description` and
an optional `endpoint` (`transport` tcp or udp, `port` 1-65535, optional `protocol` label
such as HTTP). A service with no endpoint needs no port; port 0 is never stored. Services
are declarations, not live status.

A service's note is keyed by its id, and documents link to it by `DocLink.entityId =
service id`. `ownerKeyFor` resolves a service to its device's preset, so the service and
its documents appear under that product in Documentation, and `/notes/<serviceId>` opens
its page. Removing a service (or its device) deletes its note and links; the documents
stay. Pasted devices get fresh service ids.

## Documents and notes

Documentation belongs to the device product (preset), not to each placed copy. A `Note`
is keyed by preset id, bus id or document id, and `DocLink.entityId` for a device document
is the preset id. Placed devices resolve to their preset through `noteKeyFor`; the notes
route redirects `/notes/<deviceId>` to `/notes/<presetId>`.

`Document.scope` is `preset` (applies to every instance of that preset), `instance`, or
`shared`. A document linked to more than one owner is shared; one with no links is
unfiled. Wiki-links inside notes are `[[Name]]` text resolved by name to a preset, bus or
document (`resolveWikiTarget`); renames rewrite them. Backlinks are computed by scanning
notes, never stored. Product notes and preset documents belong to the project; sharing products
between projects is planned as a separate device library.

## Derived data (src/model/derived.ts)

The Documentation workspace reads through `src/model/documentation.ts`: `ownerDocuments`
(an owner's own note first, then linked documents), `documentOwners`, `unfiledDocuments`,
`connectedProducts`, `framesForProduct` and `searchDocumentation` (names, note lines,
ports and CAN IDs inside a frame's range). The project overview note is keyed `overview`.

- `backlinksTo(project, entityId)`: notes that reference an entity or its product.
- `presetPortUsage(project, presetId)`: port usage combined across every placed copy.
- `portUsage(project, deviceId)`: which ports are connected, for the inspector.
