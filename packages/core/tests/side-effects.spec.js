describe('Core import side effects', () => {
    test('importing core index does not mutate globalThis keys', async () => {
        const before = new Set(Reflect.ownKeys(globalThis));
        await import('../src/index.js');
        const after = new Set(Reflect.ownKeys(globalThis));
        const added = [...after].filter((key) => !before.has(key));
        expect(added).toEqual([]);
    });

    test('importing core ir subpath does not mutate globalThis keys', async () => {
        const before = new Set(Reflect.ownKeys(globalThis));
        await import('../src/ir/index.js');
        const after = new Set(Reflect.ownKeys(globalThis));
        const added = [...after].filter((key) => !before.has(key));
        expect(added).toEqual([]);
    });
});
