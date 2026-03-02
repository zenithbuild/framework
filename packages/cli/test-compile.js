import { spawnSync } from 'child_process';

const input = `
<script server lang="ts">
  export const load = (ctx) => {
    return { ok t
  }
</script>
<p>broken</p>
`;

const res = spawnSync('../zenith-compiler/target/release/zenith-compiler', ['--stdin', 'test.zen'], {
  input,
  encoding: 'utf8'
});

console.log('STATUS:', res.status);
console.log('STDOUT:', res.stdout);
console.log('STDERR:', res.stderr);
