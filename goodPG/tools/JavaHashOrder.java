// Referencia para las pruebas de la redstone (auditoría): el orden en que Java recorre un HashSet<BlockPos> y un
// HashMap<BlockPos, ?>. En Minecraft el polvo avisa a sus vecinos en el orden de un HashSet (de ahí el
// comportamiento según el sitio) y el pistón vacía las celdas en el de un HashMap. BlockPos usa el hashCode de
// Vec3i: (y + z * 31) * 31 + x. Uso: java tools/JavaHashOrder.java > tests/fixtures/javaHashOrder.json
import java.util.*;

public class JavaHashOrder {
    record Pos(int x, int y, int z) {
        @Override public int hashCode() { return (this.y + this.z * 31) * 31 + this.x; }
        @Override public boolean equals(Object o) { return o instanceof Pos p && p.x == x && p.y == y && p.z == z; }
    }

    // Direction.values(): abajo, arriba, norte, sur, oeste, este.
    static final int[][] DIRS = { {0, -1, 0}, {0, 1, 0}, {0, 0, -1}, {0, 0, 1}, {-1, 0, 0}, {1, 0, 0} };

    public static void main(String[] args) {
        Random r = new Random(12345);
        StringBuilder out = new StringBuilder("{\n  \"sets\": [\n");
        for (int n = 0; n < 300; n++) {
            int x = n < 100 ? r.nextInt(64) - 32 : r.nextInt(2_000_000) - 1_000_000;
            int y = r.nextInt(384) - 64;
            int z = n < 100 ? r.nextInt(64) - 32 : r.nextInt(2_000_000) - 1_000_000;
            Set<Pos> set = new HashSet<>();
            set.add(new Pos(x, y, z));
            for (int[] d : DIRS) set.add(new Pos(x + d[0], y + d[1], z + d[2]));
            out.append("    [").append(x).append(", ").append(y).append(", ").append(z).append(", [");
            boolean first = true;
            for (Pos p : set) {
                if (!first) out.append(", ");
                first = false;
                out.append(p.x).append(", ").append(p.y).append(", ").append(p.z);
            }
            out.append("]]").append(n < 299 ? ",\n" : "\n");
        }
        out.append("  ],\n  \"maps\": [\n");
        for (int n = 0; n < 100; n++) {
            // Una fila de 1 a 12 celdas (como lo que empuja un pistón) de la que se quitan algunas.
            int x = r.nextInt(200) - 100, y = r.nextInt(300) - 60, z = r.nextInt(200) - 100;
            int len = 1 + r.nextInt(12);
            int[] d = DIRS[r.nextInt(6)];
            Map<Pos, Integer> map = new HashMap<>();
            List<Pos> order = new ArrayList<>();
            for (int i = 0; i < len; i++) {
                Pos p = new Pos(x + d[0] * i, y + d[1] * i, z + d[2] * i);
                map.put(p, i);
                order.add(p);
            }
            for (int i = 1; i < len; i++) map.remove(order.get(i));
            // Y algunas sueltas (ramas del slime).
            int extra = r.nextInt(5);
            for (int i = 0; i < extra; i++) {
                Pos p = new Pos(x + r.nextInt(5) - 2, y + r.nextInt(5) - 2, z + r.nextInt(5) - 2);
                if (!map.containsKey(p)) { map.put(p, len + i); order.add(p); }
            }
            out.append("    [[");
            boolean first = true;
            for (Pos p : order) {
                if (!first) out.append(", ");
                first = false;
                out.append(p.x).append(", ").append(p.y).append(", ").append(p.z);
            }
            out.append("], [");
            first = true;
            for (Pos p : map.keySet()) {
                if (!first) out.append(", ");
                first = false;
                out.append(p.x).append(", ").append(p.y).append(", ").append(p.z);
            }
            out.append("], ").append(len).append("]").append(n < 99 ? ",\n" : "\n");
        }
        out.append("  ]\n}\n");
        System.out.print(out);
    }
}
