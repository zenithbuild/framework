import test from 'node:test';
import {
    assertAgentTemplateContracts,
    assertAgentTemplateMirrorsCanonicalSkill
} from './agent-scaffold-assertions.mjs';

test('agent scaffold template is self-contained and contract-safe', () => {
    assertAgentTemplateContracts();
});

test('agent scaffold skill mirrors canonical skills.sh source', () => {
    assertAgentTemplateMirrorsCanonicalSkill();
});
