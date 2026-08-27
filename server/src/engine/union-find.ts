export class UnionFind {
  private readonly parent = new Map<number, number>();
  private readonly rank = new Map<number, number>();

  add(id: number) {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(id: number): number {
    this.add(id);
    const current = this.parent.get(id)!;
    if (current !== id) {
      const root = this.find(current);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) {
      return;
    }

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  groups(): number[][] {
    const buckets = new Map<number, number[]>();

    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const list = buckets.get(root) ?? [];
      list.push(id);
      buckets.set(root, list);
    }

    return [...buckets.values()].map((ids) => ids.sort((a, b) => a - b));
  }
}
