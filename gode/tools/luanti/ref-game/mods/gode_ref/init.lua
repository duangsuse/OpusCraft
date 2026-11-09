-- gode 对拍参考游戏：节点 + 群系（读同目录 biomes.tsv，与 JS 生成器同一张表）+ 区域导出。
-- 设置项：gode_dump_region = "x0,z0,x1,z1,y0,y1"；输出写到 <world>/dump.bin（+ .cols）。导出完即关服。
local modpath = core.get_modpath("gode_ref")

local SOLID = { "stone", "sandstone", "dirt", "grass_block", "podzol", "sand", "gravel", "snow_block", "ice" }
for _, n in ipairs(SOLID) do
  core.register_node("gode_ref:" .. n, { description = n, tiles = { "default_stone.png" }, groups = { cracky = 1 } })
end
for _, t in ipairs({ "oak", "birch", "spruce", "jungle", "acacia" }) do   -- 树：不是地面内容（洞穴 / 地牢不挖），叶子 allfaces_optional 可行走
  core.register_node("gode_ref:" .. t .. "_log", { description = t .. " log", tiles = { "default_stone.png" }, is_ground_content = false, groups = { choppy = 2 } })
  core.register_node("gode_ref:" .. t .. "_leaves", { description = t .. " leaves", drawtype = "allfaces_optional", tiles = { "default_stone.png" }, is_ground_content = false, groups = { snappy = 3 } })
end
core.register_node("gode_ref:snow", { description = "snow", drawtype = "nodebox", walkable = false, tiles = { "default_snow.png" },
  node_box = { type = "fixed", fixed = { -0.5, -0.5, -0.5, 0.5, -0.5 + 1 / 8, 0.5 } } })
for _, n in ipairs({ "water", "river_water" }) do
  core.register_node("gode_ref:" .. n .. "_source", { description = n, drawtype = "liquid", tiles = { "default_water.png" },
    walkable = false, pointable = false, buildable_to = true, liquidtype = "source", liquid_alternative_flowing = "gode_ref:" .. n .. "_source",
    liquid_alternative_source = "gode_ref:" .. n .. "_source", liquid_viscosity = 1, liquid_renewable = (n == "water"),
    liquid_range = 0, groups = { liquid = 3 } })
end
core.register_alias("mapgen_stone", "gode_ref:stone")
core.register_alias("mapgen_water_source", "gode_ref:water_source")
core.register_alias("mapgen_river_water_source", "gode_ref:river_water_source")

local function node(name) if name == "" or name == nil then return nil end
  if name == "water" or name == "river_water" then return "gode_ref:" .. name .. "_source" end return "gode_ref:" .. name end

core.clear_registered_biomes()
local fh = assert(io.open(modpath .. "/biomes.tsv", "r"))
local head
for line in fh:lines() do
  if line:sub(1, 1) ~= "#" and line ~= "" then
    local f = {}
    for c in (line .. "\t"):gmatch("(.-)\t") do f[#f + 1] = c end
    if not head then head = f else
      local r = {}
      for i, k in ipairs(head) do r[k] = f[i] end
      core.register_biome({ name = r.name, y_min = tonumber(r.y_min), y_max = tonumber(r.y_max), heat_point = tonumber(r.heat), humidity_point = tonumber(r.humid),
        vertical_blend = tonumber(r.vblend), node_top = node(r.top), depth_top = tonumber(r.dtop), node_filler = node(r.filler), depth_filler = tonumber(r.dfiller),
        node_stone = node(r.stone), node_water_top = node(r.wtop), depth_water_top = tonumber(r.dwtop), node_water = node(r.water), node_river_water = node(r.river),
        node_riverbed = node(r.riverbed), depth_riverbed = tonumber(r.driverbed), node_dust = node(r.dust) })
    end
  end
end
fh:close()

-- 装饰：run.mjs 把 defl/g/lt/decorations.json + schematics.json 转成 decos.lua（返回 { {name=…, deco_type=…, schematic={…}}, … }）
local df = io.open(modpath .. "/decos.lua", "r")
if df then df:close(); for _, d in ipairs(dofile(modpath .. "/decos.lua")) do core.register_decoration(d) end end

-- 区域导出：二进制 u16（节点名索引），顺序 x → z → y（y 最快），外加每列 biome / heat / humidity（取 y = y_probe 处的 get_biome_data）
core.after(0, function()
  local reg = core.settings:get("gode_dump_region"); local out = core.get_worldpath() .. "/dump.bin"   -- 模组只能写世界目录；run.mjs 再搬走
  if not reg then return end
  local x0, z0, x1, z1, y0, y1 = reg:match("(-?%d+),(-?%d+),(-?%d+),(-?%d+),(-?%d+),(-?%d+)")
  x0, z0, x1, z1, y0, y1 = tonumber(x0), tonumber(z0), tonumber(x1), tonumber(z1), tonumber(y0), tonumber(y1)
  local pmin, pmax = { x = x0, y = y0, z = z0 }, { x = x1, y = y1, z = z1 }
  local pad = tonumber(core.settings:get("gode_emerge_pad") or "0")   -- 多生成一圈，相邻块的树冠才会落进区域边缘
  core.emerge_area({ x = x0 - pad, y = y0, z = z0 - pad }, { x = x1 + pad, y = y1, z = z1 + pad }, function() end, nil)
  local function try()
    local vm = core.get_voxel_manip()
    local emin, emax = vm:read_from_map(pmin, pmax)
    local data = vm:get_data(); local area = VoxelArea(emin, emax)
    local names, idx, nlist = {}, {}, {}
    local function id_of(c) local i = idx[c]
      if not i then i = #nlist; idx[c] = i; nlist[#nlist + 1] = core.get_name_from_content_id(c) end return i end
    local buf, n = {}, 0
    local ignore = core.CONTENT_IGNORE
    local nign = 0
    for x = x0, x1 do for z = z0, z1 do
      for y = y0, y1 do
        local c = data[area:index(x, y, z)]
        if c == ignore then nign = nign + 1 end
        local i = id_of(c)
        n = n + 1; buf[n] = string.char(i % 256, math.floor(i / 256))
      end
    end end
    if nign > 0 then return false end
    local col = {}
    local py = tonumber(core.settings:get("gode_biome_y") or "30")
    for x = x0, x1 do for z = z0, z1 do
      local d = core.get_biome_data({ x = x, y = py, z = z })
      col[#col + 1] = string.format("%d,%.4f,%.4f", d and d.biome or -1, d and d.heat or 0, d and d.humidity or 0)
    end end
    local f = assert(io.open(out, "wb"))
    f:write(core.write_json({ region = { x0, z0, x1, z1, y0, y1 }, names = nlist, biomeY = py, biomes = (function() local t = {}
      for i, name in pairs(core.registered_biomes) do t[#t + 1] = { name = name.name, id = core.get_biome_id(name.name) } end return t end)() }) .. "\n")
    f:write(table.concat(buf)); f:close()
    local g = assert(io.open(out .. ".cols", "w")); g:write(table.concat(col, "\n")); g:close()
    core.log("action", "gode_ref: dump written " .. out)
    core.request_shutdown("dump done")
    return true
  end
  local tries = 0
  local function loop() tries = tries + 1
    if try() then return end
    if tries > 200 then core.log("error", "gode_ref: emerge timeout"); core.request_shutdown("timeout"); return end
    core.after(0.5, loop) end
  core.after(1, loop)
end)
